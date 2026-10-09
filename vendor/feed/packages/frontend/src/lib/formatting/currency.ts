// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * USD currency helpers for food-item logistics (docs/reports/logistics.md).
 *
 * Currency is parsed from its string representation directly to integer
 * cents — never through floating-point math, which rounds unpredictably
 * (e.g. `10.28 * 100 === 1027.9999...`). Cents are the only stored form;
 * derived unit costs keep full precision for analytics and round to two
 * decimals for display only.
 */

/** Matches an optional-$ dollars value with at most two decimals. */
const CURRENCY_PATTERN = /^\$?\s*(\d{1,13})(?:\.(\d{1,2}))?$/;

/**
 * Parses a currency string ("12", "12.3", "$12.34") to integer cents.
 *
 * Returns `null` for a blank input (price Unknown) and `undefined` for an
 * invalid one, so callers can distinguish "cleared" from "typo".
 */
export function parseCurrencyToCents(input: string): number | null | undefined {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const match = CURRENCY_PATTERN.exec(trimmed);
  if (!match) return undefined;
  const dollars = parseInt(match[1], 10);
  const cents = match[2] ? parseInt(match[2].padEnd(2, '0'), 10) : 0;
  return dollars * 100 + cents;
}

/** 1234 → "12.34" (no symbol; suitable for an input field's value). */
export function formatCentsAsCurrencyText(cents: number): string {
  const dollars = Math.floor(cents / 100);
  const remainder = cents % 100;
  return `${dollars}.${String(remainder).padStart(2, '0')}`;
}

/** 1234 → "$12.34". */
export function formatCentsAsUsd(cents: number): string {
  return `$${formatCentsAsCurrencyText(cents)}`;
}

/**
 * Full-precision unit cost in cents (purchase price ÷ units per purchase).
 * Returns null when the price is Unknown. Display-only callers should
 * round; analytics keep the exact value.
 */
export function deriveUnitCostCents(
  purchasePriceCents: number | null,
  unitsPerPurchase: number
): number | null {
  if (purchasePriceCents === null || unitsPerPurchase < 1) return null;
  return purchasePriceCents / unitsPerPurchase;
}

/** Unit cost for display, rounded to whole cents: 200/3 → "$0.67". */
export function formatUnitCostForDisplay(
  purchasePriceCents: number | null,
  unitsPerPurchase: number
): string | null {
  const unitCost = deriveUnitCostCents(purchasePriceCents, unitsPerPurchase);
  if (unitCost === null) return null;
  return formatCentsAsUsd(Math.round(unitCost));
}
