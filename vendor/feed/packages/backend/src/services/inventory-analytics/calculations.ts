// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Pure inventory-analytics calculations (Reports initiative §2).
 *
 * Unknown and insufficient-history results are first-class values (null),
 * never zeros. Quantities of unlike items are never aggregated — only
 * counts, percentages, days, item-days, and dollars.
 */

const MS_PER_DAY = 86_400_000;

export interface QuantityObservation {
  at: Date;
  /** null = quantity recorded as Unknown; breaks observation adjacency. */
  quantity: number | null;
}

export interface BurnResult {
  /** Sum of quantity decreases across valid decrease intervals. */
  totalDecrease: number;
  /** Elapsed days across those decrease intervals. */
  decreaseDays: number;
  /** totalDecrease ÷ decreaseDays; null when insufficient history. */
  dailyBurn: number | null;
  /** Known-quantity observations considered. */
  knownObservations: number;
}

/**
 * Burn intervals are consecutive *known* quantity observations where the
 * quantity decreases. An Unknown observation breaks adjacency. Positive or
 * flat changes are replenishment/correction boundaries — they contribute
 * neither decrease nor elapsed time (never negative burn).
 *
 * The spec fixture: 1,000 → 0 over 14 days ⇒ dailyBurn ≈ 71.43 ⇒ weekly
 * ≈ 500 units.
 */
export function computeBurn(observations: QuantityObservation[]): BurnResult {
  let totalDecrease = 0;
  let decreaseDays = 0;
  let known = 0;
  let prev: { at: Date; quantity: number } | null = null;

  for (const obs of observations) {
    if (obs.quantity === null) {
      prev = null;
      continue;
    }
    known += 1;
    if (prev) {
      const deltaDays = (obs.at.getTime() - prev.at.getTime()) / MS_PER_DAY;
      if (obs.quantity < prev.quantity && deltaDays > 0) {
        totalDecrease += prev.quantity - obs.quantity;
        decreaseDays += deltaDays;
      }
    }
    prev = { at: obs.at, quantity: obs.quantity };
  }

  return {
    totalDecrease,
    decreaseDays,
    dailyBurn: decreaseDays > 0 ? totalDecrease / decreaseDays : null,
    knownObservations: known,
  };
}

export function weeklyBurn(dailyBurn: number | null): number | null {
  return dailyBurn === null ? null : dailyBurn * 7;
}

/** Days of cover = current quantity ÷ daily burn; null when either is unknown. */
export function daysOfCover(
  currentQuantity: number | null,
  dailyBurn: number | null
): number | null {
  if (currentQuantity === null || dailyBurn === null || dailyBurn <= 0) {
    return null;
  }
  return currentQuantity / dailyBurn;
}

/** Required units = max(0, ceil(dailyBurn × horizon − currentQuantity)). */
export function requiredUnits(
  dailyBurn: number | null,
  horizonDays: number,
  currentQuantity: number | null
): number | null {
  if (dailyBurn === null || currentQuantity === null) return null;
  return Math.max(0, Math.ceil(dailyBurn * horizonDays - currentQuantity));
}

/** Purchases needed = ceil(requiredUnits ÷ unitsPerPurchase). */
export function purchasesNeeded(
  required: number | null,
  unitsPerPurchase: number
): number | null {
  if (required === null) return null;
  return Math.ceil(required / Math.max(1, unitsPerPurchase));
}

export type PriceType = 'unknown' | 'donated' | 'paid';

export function priceTypeOf(purchasePriceCents: number | null): PriceType {
  if (purchasePriceCents === null) return 'unknown';
  return purchasePriceCents === 0 ? 'donated' : 'paid';
}

/**
 * Projected paid cost = purchases needed × purchase price (whole packages).
 * Donated/free supply projects to 0 cost but remains labeled 'donated';
 * unknown-cost supply projects to null.
 */
export function projectedCostCents(
  purchases: number | null,
  purchasePriceCents: number | null
): number | null {
  if (purchases === null || purchasePriceCents === null) return null;
  return purchases * purchasePriceCents;
}

/** Median of a non-empty numeric list; null for an empty one. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}
