import { describe, expect, test } from 'vitest';
import {
  categoryEventFlags,
  hasCategoryEventChange,
} from '../../../src/services/category';

const category = {
  id: 1,
  name: 'Produce',
  nameSearch: 'produce',
  limit: 100,
  limitType: 'household',
  icon: 'apple',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('Category operational history dimensions', () => {
  test('tracks limit policy independently from identity', () => {
    expect(categoryEventFlags(category, { ...category, limit: 1 })).toEqual({
      recordsLimit: true,
      recordsIdentity: false,
    });
  });

  test('does not record no-op saves', () => {
    expect(hasCategoryEventChange(categoryEventFlags(category, category))).toBe(false);
  });
});
