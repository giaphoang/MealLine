// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { Router } from 'express';
import { z } from 'zod';
import {
  ANALYTICS_RANGE_PRESETS,
  isValidLocalDate,
  isValidTimeZone,
  localDateOf,
  resolveRange,
} from '../services/inventory-analytics/timezone';
import {
  computeOperationalAnalytics,
  getOperationalAnalyticsStartDate,
  OperationalAnalyticsResult,
} from '../services/operational-analytics';
import {
  getAppliedOperatingHoursRevisions,
  getOperatingHoursSettings,
} from '../services/operating-hours';

const router = Router();

const requestSchema = z.object({
  preset: z.enum(ANALYTICS_RANGE_PRESETS),
  // Accepted for backwards compatibility; canonical report dates use the
  // organization-wide pantry timezone from Settings.
  timeZone: z.string().refine(isValidTimeZone, 'Choose a valid timezone.').optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  assortmentCategoryId: z.number().int().positive().optional(),
}).superRefine((value, context) => {
  if (value.preset !== 'custom') return;
  if (!value.startDate || !isValidLocalDate(value.startDate)) {
    context.addIssue({ code: 'custom', path: ['startDate'], message: 'Choose a valid start date.' });
  }
  if (!value.endDate || !isValidLocalDate(value.endDate)) {
    context.addIssue({ code: 'custom', path: ['endDate'], message: 'Choose a valid end date.' });
  }
  if (value.startDate && value.endDate && value.startDate > value.endDate) {
    context.addIssue({ code: 'custom', path: ['endDate'], message: 'End date must be on or after the start date.' });
  }
});

const CARD_IDS = [
  'availability-summary',
  'available-assortment',
  'recurring-availability',
  'operational-pressure',
  'category-pressure',
  'unavailable-episodes',
  'rationing-history',
] as const;

const formulaSafe = (value: unknown): string => {
  const text = value == null ? '' : String(value);
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
};

const csv = (headers: string[], rows: unknown[][]): Buffer => {
  const quote = (value: unknown) => `"${formulaSafe(value).replace(/"/g, '""')}"`;
  const body = [headers, ...rows]
    .map((row) => row.map(quote).join(','))
    .join('\r\n');
  return Buffer.from(`\uFEFF${body}\r\n`, 'utf8');
};

export function cardCsv(
  cardId: typeof CARD_IDS[number],
  result: OperationalAnalyticsResult,
  options: { assortmentCategoryId?: number } = {}
) {
  switch (cardId) {
    case 'availability-summary':
      return csv(
        [
          'available_now', 'unavailable_now', 'limited_supply_now',
          'repeat_unavailability_items', 'item_rationed_now',
          'category_rationed_now',
          'median_restoration_hours', 'data_as_of',
          'recurrence_definition', 'query_timezone',
          'service_schedule_revision_ids',
          'service_schedule_effective_dates',
          'service_schedule_timezones',
          'service_schedule_recorded_at', 'correction_window_minutes',
          'calculation_version',
        ],
        [[
          result.summary.availableNow,
          result.summary.unavailableNow,
          result.summary.limitedSupplyNow,
          result.summary.repeatUnavailableItems,
          result.summary.itemRationedNow,
          result.summary.categoryRationedNow,
          result.summary.medianRestorationHours,
          result.dataAsOf,
          'two_or_more_observed_available_to_unavailable_transitions_with_intervening_restoration',
          result.serviceSchedule.queryTimeZone,
          result.serviceSchedule.appliedRevisions
            .map((revision) => revision.revisionId).join('|'),
          result.serviceSchedule.appliedRevisions
            .map((revision) => revision.effectiveDate).join('|'),
          result.serviceSchedule.appliedRevisions
            .map((revision) => revision.timezone).join('|'),
          result.serviceSchedule.appliedRevisions
            .map((revision) => revision.recordedAt).join('|'),
          result.correctionWindowMinutes,
          result.calculationVersion,
        ]]
      );
    case 'available-assortment': {
      const assortmentSeries = options.assortmentCategoryId
        ? result.assortmentCategorySeries.filter(
            (series) => series.categoryId === options.assortmentCategoryId
          )
        : result.assortmentCategorySeries;
      return csv(
        [
          'date', 'service_minutes', 'combined_available_item_minutes',
          'combined_average_available_item_records', 'category_id',
          'category_name', 'category_available_item_minutes',
          'category_average_available_item_records',
        ],
        result.timeline.flatMap((point) =>
          assortmentSeries.map((series) => [
            point.date,
            point.serviceMinutes,
            point.availableItemMinutes,
            point.available,
            series.categoryId,
            series.categoryName,
            point.availableCategoryItemMinutes[String(series.categoryId)],
            point.availableByCategory[String(series.categoryId)],
          ])
        )
      );
    }
    case 'recurring-availability': {
      const categories = new Map(
        result.recurringAvailabilityCategories.map((category) => [
          category.categoryId,
          category,
        ])
      );
      return csv(
        [
          'item_id', 'item_name', 'category_id', 'category_name',
          'unavailable_entries', 'restorations', 'ongoing_episodes',
          'deleted_episodes', 'median_restoration_hours',
          'latest_unavailable_at', 'category_recurring_items',
          'category_unavailable_entries', 'category_restorations',
          'category_ongoing_episodes', 'category_deleted_episodes',
          'category_median_restoration_hours', 'recurrence_definition',
        ],
        result.recurringAvailability.map((item) => {
          const category = categories.get(item.categoryId);
          return [
            item.itemId, item.itemName, item.categoryId, item.categoryName,
            item.unavailableEntries, item.restorations, item.ongoingEpisodes,
            item.deletedEpisodes, item.medianRestorationHours,
            item.latestUnavailableAt, category?.recurringItems,
            category?.unavailableEntries, category?.restorations,
            category?.ongoingEpisodes, category?.deletedEpisodes,
            category?.medianRestorationHours,
            'two_or_more_observed_available_to_unavailable_transitions_with_intervening_restoration',
          ];
        })
      );
    }
    case 'operational-pressure':
      // One column per limit configuration, mirroring the chart's lines.
      return csv(
        [
          'date', 'service_minutes', 'average_tracked_items',
          'average_limited_supply', 'average_clearance',
          'average_item_rationed', 'average_category_rationed',
          ...result.rationedLimitSeries.map(
            (series) => `item_limit_${series.limit}_per_${series.limitType}`
          ),
        ],
        result.timeline.map((point) => [
          point.date, point.serviceMinutes, point.trackedItems, point.limitedSupply,
          point.clearance, point.itemRationed, point.categoryRationed,
          ...result.rationedLimitSeries.map(
            (series) => point.rationedByLimit[series.key] ?? 0
          ),
        ])
      );
    case 'category-pressure':
      return csv(
        [
          'category_id', 'category_name', 'observed_service_minutes',
          'limited_supply_service_percent', 'clearance_service_percent',
          'item_rationed_service_percent',
          'category_rationed_service_percent', 'recurring_items',
          'recurring_unavailable_entries',
        ],
        result.categoryPressure.map((category) => [
          category.categoryId,
          category.categoryName,
          category.observedServiceMinutes,
          category.limitedSupplyServicePercent,
          category.clearanceServicePercent,
          category.itemRationedServicePercent,
          category.categoryRationedServicePercent,
          category.recurringItems,
          category.recurringUnavailableEntries,
        ])
      );
    case 'unavailable-episodes':
      return csv(
        [
          'item_id', 'item_name', 'category_name', 'started_at', 'ended_at',
          'duration_hours', 'resolution', 'entry_kind',
        ],
        result.episodes.map((episode) => [
          episode.itemId, episode.itemName, episode.categoryName,
          episode.startedAt, episode.endedAt, episode.durationHours,
          episode.resolution, episode.entryKind,
        ])
      );
    case 'rationing-history':
      return csv(
        [
          'entity_type', 'entity_id', 'entity_name', 'category_name', 'limit',
          'limit_type', 'is_no_limit', 'recorded_at',
        ],
        result.limitChanges.map((change) => [
          change.entityType, change.entityId, change.entityName,
          change.categoryName, change.limit, change.limitType,
          change.isNoLimit, change.recordedAt,
        ])
      );
  }
}

const resolveRequest = async (body: unknown) => {
  const parsed = requestSchema.parse(body);
  const now = new Date();
  const serviceSchedule = await getOperatingHoursSettings();
  if (parsed.preset === 'custom' && parsed.endDate! > localDateOf(now, serviceSchedule.timezone)) {
    const error = new Error('Choose an end date that is not in the future.') as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }
  const allStartDate = parsed.preset === 'all'
    ? await getOperationalAnalyticsStartDate(serviceSchedule.timezone)
    : null;
  const range = resolveRange(
    parsed.preset,
    serviceSchedule.timezone,
    now,
    parsed.preset === 'custom'
      ? { startDate: parsed.startDate!, endDate: parsed.endDate! }
      : undefined,
    allStartDate ?? undefined
  );
  const revisions = await getAppliedOperatingHoursRevisions(
    range.startDate,
    range.endDate
  );
  return {
    range,
    now,
    revisions,
    assortmentCategoryId: parsed.assortmentCategoryId,
  };
};

router.post('/query', async (req, res, next) => {
  try {
    const { range, now, revisions } = await resolveRequest(req.body);
    const result = await computeOperationalAnalytics(range, now, undefined, revisions);
    const { rawFoodEvents: _food, rawCategoryEvents: _category, ...publicResult } = result;
    res.json(publicResult);
  } catch (error) {
    next(error);
  }
});

router.post('/cards/:cardId/csv', async (req, res, next) => {
  try {
    const cardId = z.enum(CARD_IDS).parse(req.params.cardId);
    const { range, now, revisions, assortmentCategoryId } = await resolveRequest(req.body);
    const result = await computeOperationalAnalytics(range, now, undefined, revisions);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${cardId}.csv"`);
    res.send(cardCsv(cardId, result, { assortmentCategoryId }));
  } catch (error) {
    next(error);
  }
});

router.post('/raw/csv', async (req, res, next) => {
  try {
    const { range, now, revisions } = await resolveRequest(req.body);
    const result = await computeOperationalAnalytics(range, now, undefined, revisions);
    const statusIds = new Set(result.sampledStatusEventIds);
    const foodLimitIds = new Set(result.sampledFoodLimitEventIds);
    const categoryLimitIds = new Set(result.sampledCategoryLimitEventIds);
    const rows = [
      ...result.rawFoodEvents.filter((event) => event.recordedAt >= range.startUtc).map((event) => [
        'food_item', event.id, event.sourceFoodItemId, event.itemName,
        event.categoryName, event.eventKind, event.isInStock, event.isLimited,
        event.isClearance, event.limit, event.limitType,
        event.estimatedQuantity, event.supplySource, event.recordsStatus,
        event.recordsLimit, event.recordsQuantity, event.recordsSupply,
        statusIds.has(event.id), foodLimitIds.has(event.id),
        event.recordedAt.toISOString(),
      ]),
      ...result.rawCategoryEvents.filter((event) => event.recordedAt >= range.startUtc).map((event) => [
        'category', event.id, event.sourceCategoryId, event.categoryName,
        '', event.eventKind, '', '', '', event.limit, event.limitType,
        '', '', '', event.recordsLimit, '', '', '',
        categoryLimitIds.has(event.id), event.recordedAt.toISOString(),
      ]),
    ];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="operational-history-raw.csv"');
    res.send(csv([
      'entity_type', 'event_id', 'source_entity_id', 'entity_name',
      'category_name', 'event_kind', 'is_in_stock', 'is_limited_supply',
      'is_clearance', 'limit', 'limit_type', 'estimated_quantity',
      'supply_source', 'records_status', 'records_limit', 'records_quantity',
      'records_supply', 'included_in_status_analysis',
      'included_in_limit_analysis', 'recorded_at',
    ], rows));
  } catch (error) {
    next(error);
  }
});

export default router;
