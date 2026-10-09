import { describe, expect, test } from 'vitest';
import {
  computeOperationalAnalytics,
  CORRECTION_WINDOW_MINUTES,
  sampleCorrectionSessions,
} from '../../../src/services/operational-analytics';
import { resolveRange } from '../../../src/services/inventory-analytics/timezone';
import type { AppliedOperatingHoursRevision } from '../../../src/services/operating-hours';
import { cardCsv } from '../../../src/routes/operational-reports';

const event = (id: number, minutes: number, state: string, eventKind = 'updated') => ({
  id,
  state,
  eventKind,
  recordedAt: new Date(Date.UTC(2026, 0, 1, 12, minutes)),
});

describe('operational correction sampling', () => {
  test('resolves quick presets and All as inclusive local dates', () => {
    const now = new Date('2026-07-15T20:00:00.000Z');
    expect(resolveRange('last-7-days', 'America/Los_Angeles', now)).toMatchObject({
      startDate: '2026-07-09',
      endDate: '2026-07-15',
    });
    expect(resolveRange('all', 'America/Los_Angeles', now, undefined, '2024-02-03'))
      .toMatchObject({ startDate: '2024-02-03', endDate: '2026-07-15' });
  });

  test('uses a five-minute centralized window', () => {
    expect(CORRECTION_WINDOW_MINUTES).toBe(5);
  });

  test('collapses rapid revisions to their final effective state', () => {
    const sampled = sampleCorrectionSessions([
      event(1, 0, 'in', 'migration_baseline'),
      event(2, 10, 'out'),
      event(3, 12, 'in'),
    ], (row) => row.state);
    expect(sampled.map((row) => row.event.id)).toEqual([1]);
  });

  test('keeps transitions separated by more than five minutes', () => {
    const sampled = sampleCorrectionSessions([
      event(1, 0, 'in', 'migration_baseline'),
      event(2, 10, 'out'),
      event(3, 16, 'in'),
    ], (row) => row.state);
    expect(sampled.map((row) => row.event.id)).toEqual([1, 2, 3]);
  });

  test('never removes lifecycle boundaries', () => {
    const sampled = sampleCorrectionSessions([
      event(1, 0, 'in', 'created'),
      event(2, 1, 'in', 'deleted'),
    ], (row) => row.state);
    expect(sampled.map((row) => row.event.eventKind)).toEqual(['created', 'deleted']);
  });
});

const foodEvent = (
  id: number,
  recordedAt: string,
  overrides: Record<string, unknown> = {}
) => ({
  id,
  foodItemId: 10,
  sourceFoodItemId: 10,
  itemName: 'Tuna',
  categoryId: 2,
  categoryName: 'Canned Goods',
  isInStock: true,
  isLimited: false,
  isClearance: false,
  limit: 100,
  limitType: 'household',
  estimatedQuantity: null,
  supplySource: null,
  eventKind: 'updated',
  recordsQuantity: false,
  recordsSupply: false,
  recordsStatus: false,
  recordsLimit: false,
  recordsIdentity: false,
  recordedAt: new Date(recordedAt),
  ...overrides,
});

const categoryEvent = (
  id: number,
  recordedAt: string,
  overrides: Record<string, unknown> = {}
) => ({
  id,
  categoryId: 2,
  sourceCategoryId: 2,
  categoryName: 'Canned Goods',
  limit: 100,
  limitType: 'household',
  icon: null,
  eventKind: 'migration_baseline',
  recordsLimit: true,
  recordsIdentity: true,
  recordedAt: new Date(recordedAt),
  ...overrides,
});

const analyticsClient = (foodEvents: unknown[], categoryEvents: unknown[] = []) => ({
  foodItemInventoryEvent: {
    findMany: async () => foodEvents,
  },
  categoryInventoryEvent: {
    findMany: async () => categoryEvents,
  },
});

const testServiceSchedule: AppliedOperatingHoursRevision = {
  revisionId: 1,
  effectiveDate: '1970-01-01',
  timezone: 'UTC',
  updatedAt: '2026-01-01T00:00:00.000Z',
  hours: {
    sunday: { isOpen: true, openTime: '11:00', closeTime: '14:00' },
    monday: { isOpen: true, openTime: '11:00', closeTime: '14:00' },
    tuesday: { isOpen: true, openTime: '11:00', closeTime: '14:00' },
    wednesday: { isOpen: true, openTime: '11:00', closeTime: '14:00' },
    thursday: { isOpen: true, openTime: '11:00', closeTime: '14:00' },
    friday: { isOpen: true, openTime: '11:00', closeTime: '14:00' },
    saturday: { isOpen: true, openTime: '11:00', closeTime: '14:00' },
  },
};

describe('operational analytics semantics', () => {
  const now = new Date('2026-07-11T20:00:00.000Z');
  const range = resolveRange('last-30-days', 'UTC', now);

  test('treats pre-baseline time as untracked and an unavailable baseline as state, not an episode', async () => {
    const result = await computeOperationalAnalytics(
      range,
      now,
      analyticsClient([
        foodEvent(1, '2026-07-10T12:00:00.000Z', {
          eventKind: 'migration_baseline',
          isInStock: false,
          recordsStatus: true,
          recordsLimit: true,
          recordsIdentity: true,
        }),
      ]) as never,
      [testServiceSchedule]
    );

    expect(result.summary.unavailableNow).toBe(1);
    expect(result.summary.unavailableEpisodes).toBe(0);
    expect(result.timeline).toHaveLength(2);
    expect(result.timeline[0].date).toBe('2026-07-10');
  });

  test('collapses a quickly corrected availability toggle without losing raw events', async () => {
    const rows = [
      foodEvent(1, '2026-07-10T12:00:00.000Z', {
        eventKind: 'migration_baseline', recordsStatus: true,
      }),
      foodEvent(2, '2026-07-11T10:00:00.000Z', {
        isInStock: false, recordsStatus: true,
      }),
      foodEvent(3, '2026-07-11T10:03:00.000Z', {
        isInStock: true, recordsStatus: true,
      }),
    ];
    const result = await computeOperationalAnalytics(
      range,
      now,
      analyticsClient(rows) as never,
      [testServiceSchedule]
    );

    expect(result.episodes).toEqual([]);
    expect(result.rawFoodEvents).toHaveLength(3);
    expect(result.sampledStatusEventIds).toEqual([1]);
  });

  test('keeps a limit change when an identity-only edit follows inside the correction window', async () => {
    const result = await computeOperationalAnalytics(
      range,
      now,
      analyticsClient(
        [
          foodEvent(1, '2026-07-10T12:00:00.000Z', {
            eventKind: 'migration_baseline', recordsStatus: true, recordsLimit: true,
          }),
          foodEvent(2, '2026-07-11T10:00:00.000Z', {
            limit: 1, recordsLimit: true,
          }),
          foodEvent(3, '2026-07-11T10:02:00.000Z', {
            itemName: 'Canned Tuna', limit: 1, recordsIdentity: true,
          }),
        ],
        [categoryEvent(1, '2026-07-10T12:00:00.000Z')]
      ) as never,
      [testServiceSchedule]
    );

    expect(result.limitChanges).toHaveLength(1);
    expect(result.limitChanges[0]).toMatchObject({
      entityType: 'food_item',
      limit: 1,
    });
    expect(result.sampledFoodLimitEventIds).toContain(2);
  });

  test('breaks the rationed timeline down by limit configuration', async () => {
    const result = await computeOperationalAnalytics(
      range,
      now,
      analyticsClient([
        foodEvent(1, '2026-07-09T10:00:00.000Z', {
          eventKind: 'migration_baseline', recordsStatus: true, recordsLimit: true,
          limit: 1, limitType: 'household',
        }),
        foodEvent(2, '2026-07-09T10:00:00.000Z', {
          foodItemId: 11, sourceFoodItemId: 11, itemName: 'Rice',
          eventKind: 'migration_baseline', recordsStatus: true, recordsLimit: true,
          limit: 2, limitType: 'person',
        }),
        // No Limit (sentinel 100): rationed in no series.
        foodEvent(3, '2026-07-09T10:00:00.000Z', {
          foodItemId: 12, sourceFoodItemId: 12, itemName: 'Beans',
          eventKind: 'migration_baseline', recordsStatus: true, recordsLimit: true,
        }),
        // Rice moves from 2-per-person to 1-per-household the next day.
        foodEvent(4, '2026-07-10T10:00:00.000Z', {
          foodItemId: 11, sourceFoodItemId: 11, itemName: 'Rice',
          limit: 1, limitType: 'household', recordsLimit: true,
        }),
      ]) as never,
      [testServiceSchedule]
    );

    expect(result.rationedLimitSeries.map((series) => series.key)).toEqual([
      '1|household',
      '2|person',
    ]);

    const first = result.timeline[0];
    expect(first.rationedByLimit).toEqual({ '1|household': 1, '2|person': 1 });

    // After the change, both rationed items share 1-per-household and the
    // vacated 2-per-person series is zero-filled, not dropped.
    const last = result.timeline[result.timeline.length - 1];
    expect(last.rationedByLimit).toEqual({ '1|household': 2, '2|person': 0 });
    expect(last.itemRationed).toBe(2);
  });

  test('tracks category limits separately and weights changes within service hours', async () => {
    const result = await computeOperationalAnalytics(
      range,
      now,
      analyticsClient(
        [
          foodEvent(1, '2026-07-10T10:00:00.000Z', {
            eventKind: 'migration_baseline', recordsStatus: true,
          }),
        ],
        [
          categoryEvent(1, '2026-07-10T10:00:00.000Z', {
            limit: 1,
          }),
          categoryEvent(2, '2026-07-10T12:30:00.000Z', {
            eventKind: 'updated', limit: 100,
          }),
        ]
      ) as never,
      [testServiceSchedule]
    );

    const point = result.timeline.find((entry) => entry.date === '2026-07-10');
    expect(point).toMatchObject({
      itemRationed: 0,
      categoryRationed: 0.5,
    });
    expect(result.summary.categoryRationedNow).toBe(0);
  });

  test('keeps Category pressure signals separate on a shared service-time basis', async () => {
    const pressureNow = new Date('2026-07-10T15:00:00.000Z');
    const pressureRange = resolveRange('custom', 'UTC', pressureNow, {
      startDate: '2026-07-10',
      endDate: '2026-07-10',
    });
    const result = await computeOperationalAnalytics(
      pressureRange,
      pressureNow,
      analyticsClient(
        [
          foodEvent(1, '2026-07-10T10:00:00.000Z', {
            eventKind: 'migration_baseline',
            recordsStatus: true,
            recordsLimit: true,
            isLimited: true,
            limit: 1,
          }),
          foodEvent(2, '2026-07-10T12:00:00.000Z', {
            recordsStatus: true,
            isLimited: false,
            isClearance: true,
            limit: 1,
          }),
        ],
        [
          categoryEvent(1, '2026-07-10T10:00:00.000Z', { limit: 1 }),
          categoryEvent(2, '2026-07-10T13:00:00.000Z', {
            eventKind: 'updated',
            limit: 100,
          }),
        ]
      ) as never,
      [testServiceSchedule]
    );

    expect(result.categoryPressure).toEqual([
      {
        categoryId: 2,
        categoryName: 'Canned Goods',
        observedServiceMinutes: 180,
        limitedSupplyServicePercent: 33.3,
        clearanceServicePercent: 66.7,
        itemRationedServicePercent: 100,
        categoryRationedServicePercent: 66.7,
        recurringItems: 0,
        recurringUnavailableEntries: 0,
      },
    ]);
    const pressureCsv = cardCsv('category-pressure', result).toString('utf8');
    expect(pressureCsv).toContain('"limited_supply_service_percent"');
    expect(pressureCsv).toContain('"Canned Goods"');
  });

  test('weights recorded availability by minutes inside service hours', async () => {
    const result = await computeOperationalAnalytics(
      range,
      now,
      analyticsClient([
        foodEvent(1, '2026-07-10T10:00:00.000Z', {
          eventKind: 'migration_baseline', recordsStatus: true,
        }),
        foodEvent(2, '2026-07-10T13:00:00.000Z', {
          isInStock: false, recordsStatus: true,
        }),
      ]) as never,
      [{
        ...testServiceSchedule,
        hours: {
          ...testServiceSchedule.hours,
          saturday: { isOpen: false, openTime: '11:00', closeTime: '14:00' },
        },
      }]
    );

    const point = result.timeline.find((entry) => entry.date === '2026-07-10');
    expect(point).toMatchObject({
      serviceMinutes: 180,
      trackedItemMinutes: 180,
      availableItemMinutes: 120,
      trackedItems: 1,
      available: 0.67,
      unavailable: 0.33,
    });
  });

  test('breaks available assortment down by Category without changing the combined total', async () => {
    const singleDayRange = resolveRange(
      'custom',
      'UTC',
      now,
      { startDate: '2026-07-10', endDate: '2026-07-10' }
    );
    const result = await computeOperationalAnalytics(
      singleDayRange,
      now,
      analyticsClient([
        foodEvent(1, '2026-07-10T10:00:00.000Z', {
          eventKind: 'migration_baseline', recordsStatus: true,
        }),
        foodEvent(2, '2026-07-10T13:00:00.000Z', {
          isInStock: false, recordsStatus: true,
        }),
        foodEvent(3, '2026-07-10T10:00:00.000Z', {
          foodItemId: 11,
          sourceFoodItemId: 11,
          itemName: 'Bread',
          categoryId: 3,
          categoryName: 'Bakery',
          eventKind: 'migration_baseline',
          recordsStatus: true,
        }),
      ]) as never,
      [testServiceSchedule]
    );

    expect(result.timeline).toHaveLength(1);
    expect(result.timeline[0]).toMatchObject({
      serviceMinutes: 180,
      availableItemMinutes: 300,
      availableCategoryItemMinutes: { '2': 120, '3': 180 },
      available: 1.67,
      availableByCategory: { '2': 0.67, '3': 1 },
    });
    expect(result.assortmentCategorySeries).toEqual([
      { categoryId: 3, categoryName: 'Bakery', averageAvailable: 1 },
      { categoryId: 2, categoryName: 'Canned Goods', averageAvailable: 0.67 },
    ]);
    expect(result.summary.averageAvailableAssortment).toBe(1.67);
    expect(result.summary.latestAvailableAssortment).toBe(1.67);

    const assortmentCsv = cardCsv('available-assortment', result).toString('utf8');
    expect(assortmentCsv).toContain('"combined_average_available_item_records"');
    expect(assortmentCsv).toContain('"category_average_available_item_records"');
    expect(assortmentCsv).toContain('"Bakery"');
    expect(assortmentCsv).toContain('"Canned Goods"');
    expect(assortmentCsv.trim().split('\r\n')).toHaveLength(3);

    const filteredAssortmentCsv = cardCsv('available-assortment', result, {
      assortmentCategoryId: 3,
    }).toString('utf8');
    expect(filteredAssortmentCsv).toContain('"Bakery"');
    expect(filteredAssortmentCsv).not.toContain('"Canned Goods"');
    expect(filteredAssortmentCsv.trim().split('\r\n')).toHaveLength(2);
  });

  test('separates repeat transitions from initial unavailable states and one-time episodes', async () => {
    const result = await computeOperationalAnalytics(
      range,
      now,
      analyticsClient([
        foodEvent(1, '2026-07-01T10:00:00.000Z', {
          eventKind: 'migration_baseline', recordsStatus: true,
        }),
        foodEvent(2, '2026-07-02T12:00:00.000Z', {
          isInStock: false, recordsStatus: true,
        }),
        foodEvent(3, '2026-07-03T12:00:00.000Z', {
          isInStock: true, recordsStatus: true,
        }),
        foodEvent(4, '2026-07-04T12:00:00.000Z', {
          isInStock: false, recordsStatus: true,
        }),
        foodEvent(5, '2026-07-05T12:00:00.000Z', {
          isInStock: true, recordsStatus: true,
        }),
        foodEvent(6, '2026-07-01T10:00:00.000Z', {
          foodItemId: 11, sourceFoodItemId: 11, itemName: 'Bread',
          eventKind: 'created', isInStock: false, recordsStatus: true,
        }),
        foodEvent(7, '2026-07-02T12:00:00.000Z', {
          foodItemId: 11, sourceFoodItemId: 11, itemName: 'Bread',
          isInStock: true, recordsStatus: true,
        }),
        foodEvent(8, '2026-07-03T12:00:00.000Z', {
          foodItemId: 11, sourceFoodItemId: 11, itemName: 'Bread',
          isInStock: false, recordsStatus: true,
        }),
        foodEvent(9, '2026-07-04T12:00:00.000Z', {
          foodItemId: 11, sourceFoodItemId: 11, itemName: 'Bread',
          isInStock: true, recordsStatus: true,
        }),
        foodEvent(10, '2026-07-06T12:00:00.000Z', {
          categoryId: 3,
          categoryName: 'Pantry Staples',
          recordsIdentity: true,
        }),
      ]) as never,
      [testServiceSchedule]
    );

    expect(result.summary.repeatUnavailableItems).toBe(1);
    expect(result.summary).toMatchObject({
      recurringUnavailableEntries: 2,
      recurringRestorations: 2,
      recurringOngoingEpisodes: 0,
      recurringMedianRestorationHours: 24,
    });
    expect(result.recurringAvailability).toEqual([
      expect.objectContaining({
        itemId: 10,
        itemName: 'Tuna',
        categoryId: 3,
        categoryName: 'Pantry Staples',
        unavailableEntries: 2,
        restorations: 2,
        ongoingEpisodes: 0,
        deletedEpisodes: 0,
        medianRestorationHours: 24,
      }),
    ]);
    expect(result.recurringAvailabilityCategories).toEqual([
      {
        categoryId: 3,
        categoryName: 'Pantry Staples',
        recurringItems: 1,
        unavailableEntries: 2,
        restorations: 2,
        ongoingEpisodes: 0,
        deletedEpisodes: 0,
        medianRestorationHours: 24,
      },
    ]);
    const recurringCsv = cardCsv('recurring-availability', result).toString('utf8');
    expect(recurringCsv).toContain('"category_recurring_items"');
    expect(recurringCsv).toContain('"category_median_restoration_hours"');
    expect(recurringCsv).toContain(
      'two_or_more_observed_available_to_unavailable_transitions_with_intervening_restoration'
    );
    const afterRecategorization = result.timeline.find(
      (point) => point.date === '2026-07-07'
    );
    expect(afterRecategorization?.availableByCategory).toMatchObject({
      '2': 1,
      '3': 1,
    });
    expect(result.episodes.filter((episode) => episode.itemId === 11)).toEqual([
      expect.objectContaining({ entryKind: 'availability_transition' }),
      expect.objectContaining({ entryKind: 'initial_unavailable' }),
    ]);
  });

  test('applies the schedule revision in force on each historical service date', async () => {
    const historicalRange = resolveRange(
      'custom',
      'UTC',
      now,
      { startDate: '2026-07-10', endDate: '2026-07-11' }
    );
    const fridaySchedule: AppliedOperatingHoursRevision = {
      ...testServiceSchedule,
      revisionId: 10,
      effectiveDate: '1970-01-01',
      hours: {
        ...testServiceSchedule.hours,
        friday: { isOpen: true, openTime: '11:00', closeTime: '14:00' },
        saturday: { isOpen: false, openTime: '11:00', closeTime: '14:00' },
      },
    };
    const saturdayRevision: AppliedOperatingHoursRevision = {
      ...fridaySchedule,
      revisionId: 11,
      effectiveDate: '2026-07-11',
      updatedAt: '2026-07-11T08:00:00.000Z',
      hours: {
        ...fridaySchedule.hours,
        friday: { isOpen: false, openTime: '11:00', closeTime: '14:00' },
        saturday: { isOpen: true, openTime: '10:00', closeTime: '12:00' },
      },
    };

    const result = await computeOperationalAnalytics(
      historicalRange,
      now,
      analyticsClient([
        foodEvent(1, '2026-07-10T10:00:00.000Z', {
          eventKind: 'migration_baseline', recordsStatus: true,
        }),
      ]) as never,
      [fridaySchedule, saturdayRevision]
    );

    expect(result.timeline.map(({ date, serviceMinutes }) => ({
      date,
      serviceMinutes,
    }))).toEqual([
      { date: '2026-07-10', serviceMinutes: 180 },
      { date: '2026-07-11', serviceMinutes: 120 },
    ]);
    expect(result.serviceSchedule.appliedRevisions.map(
      (revision) => revision.revisionId
    )).toEqual([10, 11]);
  });
});
