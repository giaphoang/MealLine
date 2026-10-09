// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Central availability/Supply normalization
 * (docs/reports/operational-analytics-design.md).
 *
 * Every pathway that can change a food item's status flags or estimated
 * quantity — edit form, row quick actions, bulk status actions,
 * duplicate-name recovery, deletion alternatives, Shopping List Builder
 * inventory actions — must resolve the final state through
 * {@link resolveStockAndQuantity} so the invariants hold everywhere.
 *
 * Availability and estimated quantity are deliberately independent. A quick
 * status action never edits quantity, and an explicit zero quantity never
 * changes availability. The only invariant is that an unavailable item
 * cannot simultaneously carry Limited Supply or Clearance flags.
 */

export interface StatusFlagsState {
  isInStock: boolean;
  isLimited: boolean;
  isClearance: boolean;
}

export interface StockQuantityState extends StatusFlagsState {
  estimatedQuantity: number | null;
}

export interface StockQuantityRequest {
  /** Requested status flags; omitted fields inherit the current value. */
  statusFlags?: Partial<StatusFlagsState>;
  /** Requested quantity. Only meaningful when `estimatedQuantityProvided`. */
  estimatedQuantity?: number | null;
  /**
   * True when the caller explicitly supplied a quantity (including null =
   * Unknown). Quick status actions never provide one; the full edit form
   * always does.
   */
  estimatedQuantityProvided: boolean;
}

const outOfStockState = (
  estimatedQuantity: number | null
): StockQuantityState => ({
  isInStock: false,
  isLimited: false,
  isClearance: false,
  estimatedQuantity,
});

export function resolveStockAndQuantity(
  current: StockQuantityState,
  request: StockQuantityRequest
): StockQuantityState {
  const flags = {
    isInStock: request.statusFlags?.isInStock ?? current.isInStock,
    isLimited: request.statusFlags?.isLimited ?? current.isLimited,
    isClearance: request.statusFlags?.isClearance ?? current.isClearance,
  };
  const qtyProvided = request.estimatedQuantityProvided;
  const requestedQuantity = qtyProvided
    ? request.estimatedQuantity ?? null
    : current.estimatedQuantity;

  return flags.isInStock
    ? {
        isInStock: true,
        isLimited: flags.isLimited,
        isClearance: flags.isClearance,
        estimatedQuantity: requestedQuantity,
      }
    : outOfStockState(requestedQuantity);
}

/** Snapshot of the ledger-tracked fields of a food item. */
export interface TrackedItemState extends StockQuantityState {
  name: string;
  categoryId: number;
  limit: number;
  limitType: string;
  supplySource: string | null;
}

export interface EventRecordFlags {
  recordsQuantity: boolean;
  recordsSupply: boolean;
  recordsStatus: boolean;
  recordsLimit: boolean;
  recordsIdentity: boolean;
}

/**
 * Which ledger dimensions an update actually changed. An `updated` event is
 * only written when at least one flag is true — no-op saves must not create
 * ledger noise.
 */
export function computeEventRecordFlags(
  before: TrackedItemState,
  after: TrackedItemState
): EventRecordFlags {
  return {
    recordsQuantity: before.estimatedQuantity !== after.estimatedQuantity,
    recordsSupply: before.supplySource !== after.supplySource,
    recordsStatus:
      before.isInStock !== after.isInStock ||
      before.isLimited !== after.isLimited ||
      before.isClearance !== after.isClearance,
    recordsLimit:
      before.limit !== after.limit || before.limitType !== after.limitType,
    recordsIdentity:
      before.name !== after.name || before.categoryId !== after.categoryId,
  };
}

export function isEffectiveTrackedChange(flags: EventRecordFlags): boolean {
  return (
    flags.recordsQuantity ||
    flags.recordsSupply ||
    flags.recordsStatus ||
    flags.recordsLimit ||
    flags.recordsIdentity
  );
}
