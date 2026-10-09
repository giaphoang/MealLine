import { describe, expect, test } from 'vitest';
import {
  computeEventRecordFlags,
  isEffectiveTrackedChange,
  resolveStockAndQuantity,
  TrackedItemState,
} from '../../../src/services/food-item/stock-consistency';
import { parseSupplyPayload } from '../../../src/utils/foodItemUtils';

const base: TrackedItemState = {
  name: 'Tuna',
  categoryId: 1,
  limit: 1,
  limitType: 'household',
  isInStock: true,
  isLimited: false,
  isClearance: false,
  estimatedQuantity: 12,
  supplySource: null,
};

describe('availability and optional Supply independence', () => {
  test('Mark Out of Stock changes only availability and keeps quantity', () => {
    expect(resolveStockAndQuantity(base, {
      statusFlags: { isInStock: false },
      estimatedQuantityProvided: false,
    })).toEqual({
      isInStock: false,
      isLimited: false,
      isClearance: false,
      estimatedQuantity: 12,
    });
  });

  test('zero quantity does not change availability', () => {
    expect(resolveStockAndQuantity(base, {
      estimatedQuantity: 0,
      estimatedQuantityProvided: true,
    }).isInStock).toBe(true);
  });

  test('positive quantity does not restore an unavailable item', () => {
    expect(resolveStockAndQuantity({ ...base, isInStock: false }, {
      estimatedQuantity: 25,
      estimatedQuantityProvided: true,
    }).isInStock).toBe(false);
  });
});

describe('operational event dimensions', () => {
  test('quantity, source, status, limits, and identity are independent', () => {
    expect(computeEventRecordFlags(base, { ...base, estimatedQuantity: 9 })).toEqual({
      recordsQuantity: true,
      recordsSupply: false,
      recordsStatus: false,
      recordsLimit: false,
      recordsIdentity: false,
    });
    expect(computeEventRecordFlags(base, { ...base, supplySource: 'donated' })).toMatchObject({ recordsSupply: true });
    expect(computeEventRecordFlags(base, { ...base, limit: 100 })).toMatchObject({ recordsLimit: true });
    expect(isEffectiveTrackedChange(computeEventRecordFlags(base, base))).toBe(false);
  });
});

describe('parseSupplyPayload', () => {
  test('accepts optional quantity and source', () => {
    expect(parseSupplyPayload(undefined)).toBeUndefined();
    expect(parseSupplyPayload({ estimatedQuantity: null, supplySource: null })).toEqual({
      estimatedQuantity: null,
      supplySource: null,
      estimatedQuantityProvided: true,
    });
    expect(parseSupplyPayload({ estimatedQuantity: 42, supplySource: 'mixed_other' })).toEqual({
      estimatedQuantity: 42,
      supplySource: 'mixed_other',
      estimatedQuantityProvided: true,
    });
  });

  test('rejects invalid annotations', () => {
    expect(() => parseSupplyPayload({ estimatedQuantity: -1 })).toThrow();
    expect(() => parseSupplyPayload({ estimatedQuantity: 1.5 })).toThrow();
    expect(() => parseSupplyPayload({ supplySource: 'government' })).toThrow();
  });
});
