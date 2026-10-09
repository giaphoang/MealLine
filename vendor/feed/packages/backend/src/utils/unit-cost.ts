// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Derived unit cost in cents (purchase price ÷ units per purchase),
 * mirroring the frontend helper in
 * `packages/frontend/src/lib/formatting/currency.ts`. Full precision is
 * kept for analytics; only currency *display* rounds to two decimals.
 */
export function deriveUnitCostCents(
  purchasePriceCents: number | null,
  unitsPerPurchase: number
): number | null {
  if (purchasePriceCents === null || unitsPerPurchase < 1) return null;
  return purchasePriceCents / unitsPerPurchase;
}
