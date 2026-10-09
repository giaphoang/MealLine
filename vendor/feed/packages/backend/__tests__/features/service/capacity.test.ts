// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { describe, expect, test } from 'vitest';
import {
  capacityPlanForServiceDate,
  validateServiceCapacityPlanRevision,
  type ServiceCapacityPlanRevisionDraft,
} from '../../../src/services/service';

const wthPlan: ServiceCapacityPlanRevisionDraft = {
  planKey: 'wth_daily_pantry',
  revision: 1,
  displayName: 'WTH daily pantry capacity',
  description: 'Reviewed operating estimate.',
  timezone: 'America/Los_Angeles',
  effectiveStartDate: '2025-07-01',
  effectiveEndDate: null,
  isActive: true,
  targets: [
    {
      targetKey: 'formal_households_total',
      displayName: 'Households served',
      unit: 'households',
      targetValue: 145,
      metricKey: null,
      displayOrder: 0,
    },
    {
      targetKey: 'shopping_visits',
      displayName: 'Shopping visits',
      unit: 'households',
      targetValue: 75,
      metricKey: 'shopping_visits',
      displayOrder: 1,
    },
    {
      targetKey: 'premade_bags',
      displayName: 'Premade bags',
      unit: 'households',
      targetValue: 45,
      metricKey: 'premade_bags',
      displayOrder: 2,
    },
    {
      targetKey: 'long_lists',
      displayName: 'Long lists',
      unit: 'households',
      targetValue: 25,
      metricKey: 'long_lists',
      displayOrder: 3,
    },
  ],
};

describe('Service capacity plans', () => {
  test('represents the reviewed total and component targets without conflating them', () => {
    const result = validateServiceCapacityPlanRevision(wthPlan);
    expect(result.targets).toEqual(expect.arrayContaining([
      expect.objectContaining({ targetKey: 'formal_households_total', targetValue: 145, metricKey: null }),
      expect.objectContaining({ targetKey: 'shopping_visits', targetValue: 75 }),
      expect.objectContaining({ targetKey: 'premade_bags', targetValue: 45 }),
      expect.objectContaining({ targetKey: 'long_lists', targetValue: 25 }),
    ]));
  });

  test('selects the effective revision for a service date', () => {
    const prior = { ...wthPlan, revision: 1, effectiveStartDate: '2025-01-01', effectiveEndDate: '2025-06-30' };
    const current = { ...wthPlan, revision: 2 };

    expect(capacityPlanForServiceDate('2025-06-30', [prior, current])?.revision).toBe(1);
    expect(capacityPlanForServiceDate('2025-07-01', [prior, current])?.revision).toBe(2);
  });

  test('rejects duplicate targets and invalid effective dates', () => {
    expect(() => validateServiceCapacityPlanRevision({
      ...wthPlan,
      targets: [...wthPlan.targets, { ...wthPlan.targets[0] }],
    })).toThrow(/appears more than once/i);

    expect(() => validateServiceCapacityPlanRevision({
      ...wthPlan,
      effectiveEndDate: '2025-06-30',
    })).toThrow(/on or after/i);
  });
});
