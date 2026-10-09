// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import {
  CategoryInventoryEvent,
  FoodItemInventoryEvent,
  PrismaClient,
} from '@prisma/client';
import prisma from '../../db';
import {
  localDateOf,
  ResolvedRange,
  shiftLocalDate,
} from '../inventory-analytics/timezone';
import {
  AppliedOperatingHoursRevision,
  DEFAULT_OPERATING_HOURS_SETTINGS,
  operatingHoursRevisionForDate,
  serviceWindowForDate,
} from '../operating-hours';

export const CORRECTION_WINDOW_MINUTES = 5;
export const CORRECTION_WINDOW_MS = CORRECTION_WINDOW_MINUTES * 60 * 1000;
export const OPERATIONAL_ANALYTICS_VERSION =
  'operational-analytics-v7-category-pressure';
export const NO_LIMIT_SENTINEL = 100;

type LifecycleKind = 'migration_baseline' | 'created' | 'updated' | 'deleted';

interface SampledEvent<TEvent> {
  event: TEvent;
  sourceEventIds: number[];
}

const isBoundary = (kind: string) =>
  kind === 'migration_baseline' || kind === 'created' || kind === 'deleted';

/**
 * Collapses rapid updates to their final state while retaining lifecycle
 * boundaries. The ledger itself is never changed.
 */
export function sampleCorrectionSessions<TEvent extends {
  id: number;
  eventKind: string;
  recordedAt: Date;
}>(
  events: TEvent[],
  stateOf: (event: TEvent) => string
): SampledEvent<TEvent>[] {
  const ordered = [...events].sort(
    (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime() || a.id - b.id
  );
  const output: SampledEvent<TEvent>[] = [];
  let priorState: string | null = null;
  let session: TEvent[] = [];

  const flush = () => {
    if (session.length === 0) return;
    const final = session[session.length - 1];
    const finalState = stateOf(final);
    if (finalState !== priorState) {
      output.push({ event: final, sourceEventIds: session.map((event) => event.id) });
      priorState = finalState;
    }
    session = [];
  };

  for (const event of ordered) {
    if (isBoundary(event.eventKind)) {
      flush();
      output.push({ event, sourceEventIds: [event.id] });
      priorState = event.eventKind === 'deleted' ? null : stateOf(event);
      continue;
    }
    const previous = session[session.length - 1];
    if (
      previous &&
      event.recordedAt.getTime() - previous.recordedAt.getTime() >
        CORRECTION_WINDOW_MS
    ) {
      flush();
    }
    session.push(event);
  }
  flush();
  return output;
}

/** Earliest ledger observation that can truthfully anchor an All-history range. */
export async function getOperationalAnalyticsStartDate(
  timeZone: string,
  client: PrismaClient = prisma
): Promise<string | null> {
  const [foodEvent, categoryEvent] = await Promise.all([
    client.foodItemInventoryEvent.findFirst({
      orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }],
      select: { recordedAt: true },
    }),
    client.categoryInventoryEvent.findFirst({
      orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }],
      select: { recordedAt: true },
    }),
  ]);
  const earliest = [foodEvent?.recordedAt, categoryEvent?.recordedAt]
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => left.getTime() - right.getTime())[0];
  return earliest ? localDateOf(earliest, timeZone) : null;
}

export interface AvailabilityTimelinePoint {
  date: string;
  /** Scheduled service minutes observed in this point (partial for today). */
  serviceMinutes: number;
  /** Raw denominators/numerators behind service-hour availability. */
  trackedItemMinutes: number;
  availableItemMinutes: number;
  /** Available item-minutes keyed by immutable Category id. */
  availableCategoryItemMinutes: Record<string, number>;
  trackedItems: number;
  available: number;
  /** Average available Food Item records keyed by immutable Category id. */
  availableByCategory: Record<string, number>;
  unavailable: number;
  limitedSupply: number;
  clearance: number;
  itemRationed: number;
  /** Average number of categories carrying an explicit limit. */
  categoryRationed: number;
  /**
   * Rationed-item counts keyed by limit configuration ("<limit>|<limitType>",
   * e.g. "1|household"). Every key in {@link OperationalAnalyticsResult.rationedLimitSeries}
   * is present on every point (zero-filled) so chart lines stay continuous.
   */
  rationedByLimit: Record<string, number>;
}

/** One Category represented in the available-assortment timeline. */
export interface AssortmentCategorySeries {
  categoryId: number;
  categoryName: string;
  /** Service-minute-weighted average across the selected range. */
  averageAvailable: number;
}

/** One distinct limit configuration observed in the range's timeline. */
export interface RationedLimitSeries {
  key: string;
  limit: number;
  limitType: string;
}

export interface UnavailableEpisode {
  itemId: number;
  itemName: string;
  categoryId: number;
  categoryName: string;
  startedAt: string;
  endedAt: string | null;
  durationHours: number;
  resolution: 'restored' | 'deleted' | 'open_at_range_end';
  entryKind: 'initial_unavailable' | 'availability_transition';
}

export interface RecurringAvailabilityItem {
  itemId: number;
  itemName: string;
  categoryId: number;
  categoryName: string;
  unavailableEntries: number;
  restorations: number;
  ongoingEpisodes: number;
  deletedEpisodes: number;
  medianRestorationHours: number | null;
  latestUnavailableAt: string;
}

/** Category rollup for items that meet the recurring-availability definition. */
export interface RecurringAvailabilityCategory {
  categoryId: number;
  categoryName: string;
  recurringItems: number;
  unavailableEntries: number;
  restorations: number;
  ongoingEpisodes: number;
  deletedEpisodes: number;
  medianRestorationHours: number | null;
}

/** Independent Category-level pressure signals across observed service time. */
export interface CategoryPressureSummary {
  categoryId: number;
  categoryName: string;
  observedServiceMinutes: number;
  limitedSupplyServicePercent: number | null;
  clearanceServicePercent: number | null;
  itemRationedServicePercent: number | null;
  categoryRationedServicePercent: number | null;
  recurringItems: number;
  recurringUnavailableEntries: number;
}

export interface LimitChange {
  entityType: 'food_item' | 'category';
  entityId: number;
  entityName: string;
  categoryName: string | null;
  limit: number;
  limitType: string;
  isNoLimit: boolean;
  recordedAt: string;
}

export interface OperationalAnalyticsResult {
  dataAsOf: string;
  range: {
    startDate: string;
    endDate: string;
    timeZone: string;
  };
  calculationVersion: string;
  correctionWindowMinutes: number;
  serviceSchedule: {
    queryTimeZone: string;
    appliedRevisions: Array<{
      revisionId: number;
      effectiveDate: string;
      timezone: string;
      recordedAt: string;
    }>;
  };
  summary: {
    trackedItems: number;
    availableNow: number;
    unavailableNow: number;
    limitedSupplyNow: number;
    clearanceNow: number;
    itemRationedNow: number;
    categoryRationedNow: number;
    repeatUnavailableItems: number;
    recurringUnavailableEntries: number;
    recurringRestorations: number;
    recurringOngoingEpisodes: number;
    recurringMedianRestorationHours: number | null;
    unavailableEpisodes: number;
    medianRestorationHours: number | null;
    /** Service-minute-weighted combined assortment across the selected range. */
    averageAvailableAssortment: number | null;
    /** Combined assortment during the latest observed service window. */
    latestAvailableAssortment: number | null;
  };
  timeline: AvailabilityTimelinePoint[];
  assortmentCategorySeries: AssortmentCategorySeries[];
  /** Distinct limit configurations in the timeline, ordered by type then limit. */
  rationedLimitSeries: RationedLimitSeries[];
  recurringAvailability: RecurringAvailabilityItem[];
  recurringAvailabilityCategories: RecurringAvailabilityCategory[];
  categoryPressure: CategoryPressureSummary[];
  episodes: UnavailableEpisode[];
  limitChanges: LimitChange[];
  sampledStatusEventIds: number[];
  sampledFoodLimitEventIds: number[];
  sampledCategoryLimitEventIds: number[];
  rawFoodEvents: FoodItemInventoryEvent[];
  rawCategoryEvents: CategoryInventoryEvent[];
}

const groupBy = <T>(rows: T[], keyOf: (row: T) => number) => {
  const grouped = new Map<number, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const values = grouped.get(key) ?? [];
    values.push(row);
    grouped.set(key, values);
  }
  return grouped;
};

const foodStatusState = (event: FoodItemInventoryEvent) =>
  `${event.isInStock}|${event.isLimited}|${event.isClearance}|${event.itemName}|${event.categoryId}`;
const foodLimitState = (event: FoodItemInventoryEvent) =>
  `${event.limit}|${event.limitType}|${event.itemName}|${event.categoryId}`;
const foodIdentityState = (event: FoodItemInventoryEvent) =>
  `${event.itemName}|${event.categoryId}`;
const categoryLimitState = (event: CategoryInventoryEvent) =>
  `${event.limit}|${event.limitType}|${event.categoryName}`;

const sampledByItem = <TEvent extends {
  id: number;
  eventKind: string;
  recordedAt: Date;
}>(
  rows: TEvent[],
  keyOf: (row: TEvent) => number,
  stateOf: (row: TEvent) => string
) => {
  const result = new Map<number, SampledEvent<TEvent>[]>();
  for (const [key, events] of groupBy(rows, keyOf)) {
    result.set(key, sampleCorrectionSessions(events, stateOf));
  }
  return result;
};

function stateAt<TEvent extends { eventKind: string; recordedAt: Date }>(
  samples: SampledEvent<TEvent>[] | undefined,
  instant: Date
): TEvent | null {
  let current: TEvent | null = null;
  for (const sample of samples ?? []) {
    if (sample.event.recordedAt > instant) break;
    current = sample.event.eventKind === 'deleted' ? null : sample.event;
  }
  return current;
}

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
};

export async function computeOperationalAnalytics(
  range: ResolvedRange,
  dataAsOf = new Date(),
  client: PrismaClient = prisma,
  serviceSchedule: AppliedOperatingHoursRevision[] = [{
    ...DEFAULT_OPERATING_HOURS_SETTINGS,
    revisionId: 0,
    timezone: range.timeZone,
    updatedAt: new Date(0).toISOString(),
  }]
): Promise<OperationalAnalyticsResult> {
  const analysisEnd = new Date(Math.min(range.endUtc.getTime(), dataAsOf.getTime()));
  const [foodEvents, categoryEvents] = await Promise.all([
    client.foodItemInventoryEvent.findMany({
      where: { recordedAt: { lt: analysisEnd } },
      orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }],
    }),
    client.categoryInventoryEvent.findMany({
      where: { recordedAt: { lt: analysisEnd } },
      orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }],
    }),
  ]);

  // Category ids are the stable analytical identity. Names remain display
  // metadata and resolve to the latest observation at dataAsOf so a rename
  // does not split one Category into two chart series.
  const categoryNames = new Map<number, { name: string; recordedAt: number }>();
  const observeCategoryName = (
    categoryId: number,
    categoryName: string,
    recordedAt: Date
  ) => {
    const current = categoryNames.get(categoryId);
    if (!current || recordedAt.getTime() >= current.recordedAt) {
      categoryNames.set(categoryId, {
        name: categoryName,
        recordedAt: recordedAt.getTime(),
      });
    }
  };
  for (const event of foodEvents) {
    observeCategoryName(event.categoryId, event.categoryName, event.recordedAt);
  }
  for (const event of categoryEvents) {
    observeCategoryName(
      event.sourceCategoryId,
      event.categoryName,
      event.recordedAt
    );
  }
  const latestFoodIdentityByItem = new Map<number, FoodItemInventoryEvent>();
  for (const event of foodEvents) {
    latestFoodIdentityByItem.set(event.sourceFoodItemId, event);
  }

  const statusRows = foodEvents.filter(
    (event) => isBoundary(event.eventKind) || event.recordsStatus
  );
  const foodLimitRows = foodEvents.filter(
    (event) => isBoundary(event.eventKind) || event.recordsLimit
  );
  const foodIdentityRows = foodEvents.filter(
    (event) => isBoundary(event.eventKind) || event.recordsIdentity
  );
  const categoryLimitRows = categoryEvents.filter(
    (event) => isBoundary(event.eventKind) || event.recordsLimit
  );

  const statusSamples = sampledByItem(
    statusRows,
    (event) => event.sourceFoodItemId,
    foodStatusState
  );
  const foodLimitSamples = sampledByItem(
    foodLimitRows,
    (event) => event.sourceFoodItemId,
    foodLimitState
  );
  const foodIdentitySamples = sampledByItem(
    foodIdentityRows,
    (event) => event.sourceFoodItemId,
    foodIdentityState
  );
  const categoryLimitSamples = sampledByItem(
    categoryLimitRows,
    (event) => event.sourceCategoryId,
    categoryLimitState
  );

  const timeline: AvailabilityTimelinePoint[] = [];
  const trackedAssortmentCategoryIds = new Set<number>();
  const categoryPressureMilliseconds = new Map<number, {
    observed: number;
    limitedSupply: number;
    clearance: number;
    itemRationed: number;
    categoryRationed: number;
  }>();
  const appliedRevisionIds = new Set<number>();
  const roundCount = (value: number) => Math.round(value * 100) / 100;
  let date = range.startDate;
  while (date <= range.endDate) {
    const appliedSchedule = operatingHoursRevisionForDate(date, serviceSchedule);
    if (date <= localDateOf(analysisEnd, appliedSchedule.timezone)) {
      appliedRevisionIds.add(appliedSchedule.revisionId);
    }
    const configuredWindow = serviceWindowForDate(date, appliedSchedule);
    if (configuredWindow) {
      const windowStart = new Date(
        Math.max(configuredWindow.start.getTime(), range.startUtc.getTime())
      );
      const windowEnd = new Date(
        Math.min(configuredWindow.end.getTime(), analysisEnd.getTime())
      );

      if (windowEnd > windowStart) {
        const boundaryMilliseconds = new Set<number>([
          windowStart.getTime(),
          windowEnd.getTime(),
        ]);
        for (const samples of [
          ...statusSamples.values(),
          ...foodLimitSamples.values(),
          ...foodIdentitySamples.values(),
          ...categoryLimitSamples.values(),
        ]) {
          for (const sample of samples) {
            const at = sample.event.recordedAt.getTime();
            if (at > windowStart.getTime() && at < windowEnd.getTime()) {
              boundaryMilliseconds.add(at);
            }
          }
        }
        const boundaries = [...boundaryMilliseconds].sort((a, b) => a - b);
        const serviceMilliseconds = windowEnd.getTime() - windowStart.getTime();
        let dayTrackedItemMilliseconds = 0;
        let dayAvailableItemMilliseconds = 0;
        const dayAvailableCategoryItemMilliseconds: Record<string, number> = {};
        let dayUnavailableItemMilliseconds = 0;
        let dayLimitedItemMilliseconds = 0;
        let dayClearanceItemMilliseconds = 0;
        let dayRationedItemMilliseconds = 0;
        let dayRationedCategoryMilliseconds = 0;
        const rationedMillisecondsByLimit: Record<string, number> = {};

        for (let index = 0; index < boundaries.length - 1; index++) {
          const segmentStart = new Date(boundaries[index]);
          const duration = boundaries[index + 1] - boundaries[index];
          if (duration <= 0) continue;

          const statuses = [...statusSamples.values()]
            .map((samples) => stateAt(samples, segmentStart))
            .filter((event): event is FoodItemInventoryEvent => event !== null);
          const limits = [...foodLimitSamples.values()]
            .map((samples) => stateAt(samples, segmentStart))
            .filter((event): event is FoodItemInventoryEvent => event !== null);
          const identities = [...foodIdentitySamples.values()]
            .map((samples) => stateAt(samples, segmentStart))
            .filter((event): event is FoodItemInventoryEvent => event !== null);
          const identityByItem = new Map(
            identities.map((event) => [event.sourceFoodItemId, event])
          );
          const categoryIdForItem = (event: FoodItemInventoryEvent) =>
            identityByItem.get(event.sourceFoodItemId)?.categoryId ??
            event.categoryId;
          const categoryLimits = [...categoryLimitSamples.values()]
            .map((samples) => stateAt(samples, segmentStart))
            .filter((event): event is CategoryInventoryEvent => event !== null);
          const availableStatuses = statuses.filter((event) => event.isInStock);
          const available = availableStatuses.length;
          const observedCategoryIds = new Set([
            ...statuses.map(categoryIdForItem),
            ...categoryLimits.map((event) => event.sourceCategoryId),
          ]);
          const limitedCategoryIds = new Set(
            statuses
              .filter((event) => event.isLimited)
              .map(categoryIdForItem)
          );
          const clearanceCategoryIds = new Set(
            statuses
              .filter((event) => event.isClearance)
              .map(categoryIdForItem)
          );
          const itemRationedCategoryIds = new Set(
            limits
              .filter((event) => event.limit !== NO_LIMIT_SENTINEL)
              .map(categoryIdForItem)
          );
          const categoryRationedIds = new Set(
            categoryLimits
              .filter((event) => event.limit !== NO_LIMIT_SENTINEL)
              .map((event) => event.sourceCategoryId)
          );

          for (const categoryId of observedCategoryIds) {
            const pressure = categoryPressureMilliseconds.get(categoryId) ?? {
              observed: 0,
              limitedSupply: 0,
              clearance: 0,
              itemRationed: 0,
              categoryRationed: 0,
            };
            pressure.observed += duration;
            if (limitedCategoryIds.has(categoryId)) {
              pressure.limitedSupply += duration;
            }
            if (clearanceCategoryIds.has(categoryId)) {
              pressure.clearance += duration;
            }
            if (itemRationedCategoryIds.has(categoryId)) {
              pressure.itemRationed += duration;
            }
            if (categoryRationedIds.has(categoryId)) {
              pressure.categoryRationed += duration;
            }
            categoryPressureMilliseconds.set(categoryId, pressure);
          }

          for (const event of statuses) {
            trackedAssortmentCategoryIds.add(categoryIdForItem(event));
          }
          for (const event of availableStatuses) {
            const categoryKey = String(categoryIdForItem(event));
            dayAvailableCategoryItemMilliseconds[categoryKey] =
              (dayAvailableCategoryItemMilliseconds[categoryKey] ?? 0) + duration;
          }

          dayTrackedItemMilliseconds += statuses.length * duration;
          dayAvailableItemMilliseconds += available * duration;
          dayUnavailableItemMilliseconds += (statuses.length - available) * duration;
          dayLimitedItemMilliseconds += statuses.filter((event) => event.isLimited).length * duration;
          dayClearanceItemMilliseconds += statuses.filter((event) => event.isClearance).length * duration;

          for (const event of limits) {
            if (event.limit === NO_LIMIT_SENTINEL) continue;
            dayRationedItemMilliseconds += duration;
            const key = `${event.limit}|${event.limitType}`;
            rationedMillisecondsByLimit[key] =
              (rationedMillisecondsByLimit[key] ?? 0) + duration;
          }
          dayRationedCategoryMilliseconds +=
            categoryLimits.filter((event) => event.limit !== NO_LIMIT_SENTINEL).length *
            duration;
        }

        // Before the first baseline there are no tracked item-minutes. Those
        // service windows are omitted rather than reported as zero availability.
        if (dayTrackedItemMilliseconds > 0) {
          const rationedByLimit = Object.fromEntries(
            Object.entries(rationedMillisecondsByLimit).map(([key, value]) => [
              key,
              roundCount(value / serviceMilliseconds),
            ])
          );
          const availableCategoryItemMinutes = Object.fromEntries(
            Object.entries(dayAvailableCategoryItemMilliseconds).map(
              ([key, value]) => [key, value / 60_000]
            )
          );
          const availableByCategory = Object.fromEntries(
            Object.entries(dayAvailableCategoryItemMilliseconds).map(
              ([key, value]) => [key, roundCount(value / serviceMilliseconds)]
            )
          );
          timeline.push({
            date,
            serviceMinutes: serviceMilliseconds / 60_000,
            trackedItemMinutes: dayTrackedItemMilliseconds / 60_000,
            availableItemMinutes: dayAvailableItemMilliseconds / 60_000,
            availableCategoryItemMinutes,
            trackedItems: roundCount(dayTrackedItemMilliseconds / serviceMilliseconds),
            available: roundCount(dayAvailableItemMilliseconds / serviceMilliseconds),
            availableByCategory,
            unavailable: roundCount(dayUnavailableItemMilliseconds / serviceMilliseconds),
            limitedSupply: roundCount(dayLimitedItemMilliseconds / serviceMilliseconds),
            clearance: roundCount(dayClearanceItemMilliseconds / serviceMilliseconds),
            itemRationed: roundCount(dayRationedItemMilliseconds / serviceMilliseconds),
            categoryRationed: roundCount(
              dayRationedCategoryMilliseconds / serviceMilliseconds
            ),
            rationedByLimit,
          });
        }
      }
    }
    date = shiftLocalDate(date, 1);
  }

  const assortmentCategoryIds = [...trackedAssortmentCategoryIds].sort(
    (a, b) =>
      (categoryNames.get(a)?.name ?? `Category ${a}`).localeCompare(
        categoryNames.get(b)?.name ?? `Category ${b}`
      ) || a - b
  );
  for (const point of timeline) {
    for (const categoryId of assortmentCategoryIds) {
      const key = String(categoryId);
      point.availableCategoryItemMinutes[key] ??= 0;
      point.availableByCategory[key] ??= 0;
    }
  }
  const totalObservedServiceMinutes = timeline.reduce(
    (total, point) => total + point.serviceMinutes,
    0
  );
  const assortmentCategorySeries: AssortmentCategorySeries[] =
    assortmentCategoryIds.map((categoryId) => {
      const categoryItemMinutes = timeline.reduce(
        (total, point) =>
          total + point.availableCategoryItemMinutes[String(categoryId)],
        0
      );
      return {
        categoryId,
        categoryName:
          categoryNames.get(categoryId)?.name ?? `Category ${categoryId}`,
        averageAvailable:
          totalObservedServiceMinutes > 0
            ? roundCount(categoryItemMinutes / totalObservedServiceMinutes)
            : 0,
      };
    });
  const totalAvailableItemMinutes = timeline.reduce(
    (total, point) => total + point.availableItemMinutes,
    0
  );

  // The chart draws one line per limit configuration seen anywhere in the
  // range; zero-fill every point so a configuration that appears mid-range
  // still plots a continuous line (and CSV rows stay rectangular).
  const rationedLimitSeries: RationedLimitSeries[] = [
    ...new Set(timeline.flatMap((point) => Object.keys(point.rationedByLimit))),
  ]
    .map((key) => {
      const [limit, limitType] = key.split('|');
      return { key, limit: Number(limit), limitType };
    })
    .sort(
      (a, b) => a.limitType.localeCompare(b.limitType) || a.limit - b.limit
    );
  for (const point of timeline) {
    for (const series of rationedLimitSeries) {
      point.rationedByLimit[series.key] ??= 0;
    }
  }

  const episodes: UnavailableEpisode[] = [];
  const restorationDurations: number[] = [];
  for (const samples of statusSamples.values()) {
    let previous: FoodItemInventoryEvent | null = null;
    let open: {
      event: FoodItemInventoryEvent;
      entryKind: UnavailableEpisode['entryKind'];
    } | null = null;
    for (const { event } of samples) {
      if (event.eventKind === 'deleted') {
        if (open) {
          const end = event.recordedAt;
          const duration =
            (end.getTime() - open.event.recordedAt.getTime()) / 3_600_000;
          if (end > range.startUtc && open.event.recordedAt < analysisEnd) {
            episodes.push({
              itemId: open.event.sourceFoodItemId,
              itemName: open.event.itemName,
              categoryId: open.event.categoryId,
              categoryName: open.event.categoryName,
              startedAt: open.event.recordedAt.toISOString(),
              endedAt: end.toISOString(),
              durationHours: duration,
              resolution: 'deleted',
              entryKind: open.entryKind,
            });
          }
          open = null;
        }
        previous = null;
        continue;
      }
      // A migration baseline seeds current state but is not an observed
      // transition and must not inflate episode frequency.
      if (!event.isInStock && !open && event.eventKind === 'created') {
        open = { event, entryKind: 'initial_unavailable' };
      } else if (
        !event.isInStock &&
        !open &&
        event.eventKind === 'updated' &&
        event.recordsStatus &&
        previous?.isInStock === true
      ) {
        open = { event, entryKind: 'availability_transition' };
      }
      if (event.isInStock && open) {
        const duration =
          (event.recordedAt.getTime() - open.event.recordedAt.getTime()) /
          3_600_000;
        if (
          event.recordedAt > range.startUtc &&
          open.event.recordedAt < analysisEnd
        ) {
          episodes.push({
            itemId: open.event.sourceFoodItemId,
            itemName: open.event.itemName,
            categoryId: open.event.categoryId,
            categoryName: open.event.categoryName,
            startedAt: open.event.recordedAt.toISOString(),
            endedAt: event.recordedAt.toISOString(),
            durationHours: duration,
            resolution: 'restored',
            entryKind: open.entryKind,
          });
          restorationDurations.push(duration);
        }
        open = null;
      }
      previous = event;
    }
    if (open && open.event.recordedAt < analysisEnd) {
      episodes.push({
        itemId: open.event.sourceFoodItemId,
        itemName: open.event.itemName,
        categoryId: open.event.categoryId,
        categoryName: open.event.categoryName,
        startedAt: open.event.recordedAt.toISOString(),
        endedAt: null,
        durationHours:
          (analysisEnd.getTime() - open.event.recordedAt.getTime()) /
          3_600_000,
        resolution: 'open_at_range_end',
        entryKind: open.entryKind,
      });
    }
  }

  const recurrenceCandidates = groupBy(
    episodes.filter(
      (episode) =>
        episode.entryKind === 'availability_transition' &&
        new Date(episode.startedAt) >= range.startUtc &&
        new Date(episode.startedAt) < analysisEnd
    ),
    (episode) => episode.itemId
  );
  const recurringCohorts = [
    ...recurrenceCandidates.values(),
  ]
    .filter(
      (itemEpisodes) =>
        itemEpisodes.length >= 2 &&
        itemEpisodes.some((episode) => episode.resolution === 'restored')
    )
    .map((episodes) => ({
      episodes,
      latest: [...episodes].sort((a, b) =>
        b.startedAt.localeCompare(a.startedAt)
      )[0],
    }));
  const recurringEpisodesByItem = new Map(
    recurringCohorts.map(({ episodes, latest }) => [latest.itemId, episodes])
  );
  const recurringAvailability: RecurringAvailabilityItem[] = recurringCohorts
    .map(({ episodes: itemEpisodes, latest }) => {
      const restored = itemEpisodes.filter(
        (episode) => episode.resolution === 'restored'
      );
      const latestIdentity = latestFoodIdentityByItem.get(latest.itemId);
      const categoryId = latestIdentity?.categoryId ?? latest.categoryId;
      return {
        itemId: latest.itemId,
        itemName: latestIdentity?.itemName ?? latest.itemName,
        categoryId,
        categoryName:
          categoryNames.get(categoryId)?.name ??
          latestIdentity?.categoryName ??
          latest.categoryName,
        unavailableEntries: itemEpisodes.length,
        restorations: restored.length,
        ongoingEpisodes: itemEpisodes.filter(
          (episode) => episode.resolution === 'open_at_range_end'
        ).length,
        deletedEpisodes: itemEpisodes.filter(
          (episode) => episode.resolution === 'deleted'
        ).length,
        medianRestorationHours: median(
          restored.map((episode) => episode.durationHours)
        ),
        latestUnavailableAt: latest.startedAt,
      };
    })
    .sort(
      (a, b) =>
        b.unavailableEntries - a.unavailableEntries ||
        b.latestUnavailableAt.localeCompare(a.latestUnavailableAt) ||
        a.itemName.localeCompare(b.itemName)
    );
  const recurringAvailabilityCategories: RecurringAvailabilityCategory[] = [
    ...groupBy(recurringAvailability, (item) => item.categoryId).values(),
  ]
    .map((items) => {
      const categoryEpisodes = items.flatMap(
        (item) => recurringEpisodesByItem.get(item.itemId) ?? []
      );
      const restored = categoryEpisodes.filter(
        (episode) => episode.resolution === 'restored'
      );
      return {
        categoryId: items[0].categoryId,
        categoryName: items[0].categoryName,
        recurringItems: items.length,
        unavailableEntries: categoryEpisodes.length,
        restorations: restored.length,
        ongoingEpisodes: categoryEpisodes.filter(
          (episode) => episode.resolution === 'open_at_range_end'
        ).length,
        deletedEpisodes: categoryEpisodes.filter(
          (episode) => episode.resolution === 'deleted'
        ).length,
        medianRestorationHours: median(
          restored.map((episode) => episode.durationHours)
        ),
      };
    })
    .sort(
      (a, b) =>
        b.unavailableEntries - a.unavailableEntries ||
        b.recurringItems - a.recurringItems ||
        a.categoryName.localeCompare(b.categoryName)
    );
  const recurringRestoredEpisodes = recurringCohorts.flatMap(({ episodes }) =>
    episodes.filter((episode) => episode.resolution === 'restored')
  );
  const recurringCategoriesById = new Map(
    recurringAvailabilityCategories.map((category) => [
      category.categoryId,
      category,
    ])
  );
  const categoryPressureIds = new Set([
    ...categoryPressureMilliseconds.keys(),
    ...recurringCategoriesById.keys(),
  ]);
  const categoryPressure: CategoryPressureSummary[] = [...categoryPressureIds]
    .map((categoryId) => {
      const pressure = categoryPressureMilliseconds.get(categoryId);
      const recurring = recurringCategoriesById.get(categoryId);
      const observed = pressure?.observed ?? 0;
      const servicePercent = (milliseconds: number | undefined) =>
        observed > 0
          ? Math.round(((milliseconds ?? 0) / observed) * 1_000) / 10
          : null;
      return {
        categoryId,
        categoryName:
          categoryNames.get(categoryId)?.name ??
          recurring?.categoryName ??
          `Category ${categoryId}`,
        observedServiceMinutes: observed / 60_000,
        limitedSupplyServicePercent: servicePercent(pressure?.limitedSupply),
        clearanceServicePercent: servicePercent(pressure?.clearance),
        itemRationedServicePercent: servicePercent(pressure?.itemRationed),
        categoryRationedServicePercent: servicePercent(
          pressure?.categoryRationed
        ),
        recurringItems: recurring?.recurringItems ?? 0,
        recurringUnavailableEntries: recurring?.unavailableEntries ?? 0,
      };
    })
    .sort((a, b) => a.categoryName.localeCompare(b.categoryName));

  const sampledFoodLimitIds = new Set(
    [...foodLimitSamples.values()].flatMap((samples) =>
      samples.map((sample) => sample.event.id)
    )
  );
  const sampledCategoryLimitIds = new Set(
    [...categoryLimitSamples.values()].flatMap((samples) =>
      samples.map((sample) => sample.event.id)
    )
  );
  const limitChanges: LimitChange[] = [
    ...foodEvents
      .filter(
        (event) =>
          event.eventKind === 'updated' &&
          event.recordsLimit &&
          sampledFoodLimitIds.has(event.id) &&
          event.recordedAt >= range.startUtc
      )
      .map((event) => ({
        entityType: 'food_item' as const,
        entityId: event.sourceFoodItemId,
        entityName: event.itemName,
        categoryName: event.categoryName,
        limit: event.limit,
        limitType: event.limitType,
        isNoLimit: event.limit === NO_LIMIT_SENTINEL,
        recordedAt: event.recordedAt.toISOString(),
      })),
    ...categoryEvents
      .filter(
        (event) =>
          event.eventKind === 'updated' &&
          event.recordsLimit &&
          sampledCategoryLimitIds.has(event.id) &&
          event.recordedAt >= range.startUtc
      )
      .map((event) => ({
        entityType: 'category' as const,
        entityId: event.sourceCategoryId,
        entityName: event.categoryName,
        categoryName: null,
        limit: event.limit,
        limitType: event.limitType,
        isNoLimit: event.limit === NO_LIMIT_SENTINEL,
        recordedAt: event.recordedAt.toISOString(),
      })),
  ].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));

  const currentStatuses = [...statusSamples.values()]
    .map((samples) => stateAt(samples, analysisEnd))
    .filter((event): event is FoodItemInventoryEvent => event !== null);
  const currentFoodLimits = [...foodLimitSamples.values()]
    .map((samples) => stateAt(samples, analysisEnd))
    .filter((event): event is FoodItemInventoryEvent => event !== null);
  const currentCategoryLimits = [...categoryLimitSamples.values()]
    .map((samples) => stateAt(samples, analysisEnd))
    .filter((event): event is CategoryInventoryEvent => event !== null);
  const availableNow = currentStatuses.filter((event) => event.isInStock).length;
  const sampledStatusIds = new Set(
    [...statusSamples.values()].flatMap((samples) =>
      samples.map((sample) => sample.event.id)
    )
  );

  return {
    dataAsOf: dataAsOf.toISOString(),
    range: {
      startDate: range.startDate,
      endDate: range.endDate,
      timeZone: range.timeZone,
    },
    calculationVersion: OPERATIONAL_ANALYTICS_VERSION,
    correctionWindowMinutes: CORRECTION_WINDOW_MINUTES,
    serviceSchedule: {
      queryTimeZone: range.timeZone,
      appliedRevisions: serviceSchedule
        .filter((revision) => appliedRevisionIds.has(revision.revisionId))
        .map((revision) => ({
          revisionId: revision.revisionId,
          effectiveDate: revision.effectiveDate,
          timezone: revision.timezone,
          recordedAt: revision.updatedAt,
        })),
    },
    summary: {
      trackedItems: currentStatuses.length,
      availableNow,
      unavailableNow: currentStatuses.length - availableNow,
      limitedSupplyNow: currentStatuses.filter((event) => event.isLimited).length,
      clearanceNow: currentStatuses.filter((event) => event.isClearance).length,
      itemRationedNow: currentFoodLimits.filter(
        (event) => event.limit !== NO_LIMIT_SENTINEL
      ).length,
      categoryRationedNow: currentCategoryLimits.filter(
        (event) => event.limit !== NO_LIMIT_SENTINEL
      ).length,
      repeatUnavailableItems: recurringAvailability.length,
      recurringUnavailableEntries: recurringCohorts.reduce(
        (total, cohort) => total + cohort.episodes.length,
        0
      ),
      recurringRestorations: recurringRestoredEpisodes.length,
      recurringOngoingEpisodes: recurringCohorts.reduce(
        (total, cohort) =>
          total +
          cohort.episodes.filter(
            (episode) => episode.resolution === 'open_at_range_end'
          ).length,
        0
      ),
      recurringMedianRestorationHours: median(
        recurringRestoredEpisodes.map((episode) => episode.durationHours)
      ),
      unavailableEpisodes: episodes.length,
      medianRestorationHours: median(restorationDurations),
      averageAvailableAssortment:
        totalObservedServiceMinutes > 0
          ? roundCount(totalAvailableItemMinutes / totalObservedServiceMinutes)
          : null,
      latestAvailableAssortment:
        timeline.length > 0 ? timeline[timeline.length - 1].available : null,
    },
    timeline,
    assortmentCategorySeries,
    rationedLimitSeries,
    recurringAvailability,
    recurringAvailabilityCategories,
    categoryPressure,
    episodes: episodes.sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    limitChanges,
    sampledStatusEventIds: [...sampledStatusIds],
    sampledFoodLimitEventIds: [...sampledFoodLimitIds],
    sampledCategoryLimitEventIds: [...sampledCategoryLimitIds],
    rawFoodEvents: foodEvents,
    rawCategoryEvents: categoryEvents,
  };
}
