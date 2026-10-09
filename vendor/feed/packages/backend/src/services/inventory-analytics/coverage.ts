// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Data Coverage tab (Reports initiative §2). Reports on the recording
 * habits that make the other tabs trustworthy. "Last quantity change" is
 * allowed; a "last counted" / "stale count" claim is not (V1 has no
 * unchanged-count verification).
 */

import { AnalyticsContext } from './data';
import { computeItemOutlooks, ItemOutlook } from './outlook';
import { localDateOf, shiftLocalDate } from './timezone';

export interface CoverageKpis {
  liveItems: number;
  quantityCoveragePercent: number | null;
  priceCoveragePercent: number | null;
  burnReadyPercent: number | null;
  eventsInRange: number;
}

export interface BurnReadinessRow {
  status: string;
  itemCount: number;
}

export interface RecordingActivityRow {
  /** Local week start date ('YYYY-MM-DD'). */
  weekStart: string;
  eventCount: number;
  quantityEvents: number;
  priceEvents: number;
  statusEvents: number;
}

export interface DataGapRow {
  foodItemId: number;
  name: string;
  categoryName: string;
  hasQuantity: boolean;
  hasPrice: boolean;
  burnReady: boolean;
  lastQuantityChangeAt: string | null;
}

export interface CoverageResult {
  kpis: CoverageKpis;
  burnReadiness: BurnReadinessRow[];
  recordingActivity: RecordingActivityRow[];
  gaps: DataGapRow[];
  dataAsOf: string;
}

const BURN_STATUS_LABELS: Record<ItemOutlook['dataStatus'], string> = {
  ok: 'Burn-ready',
  'insufficient-history': 'Insufficient history',
  'unknown-quantity': 'Unknown quantity',
  'out-of-stock': 'Out of stock',
};

export function buildCoverage(
  context: AnalyticsContext,
  precomputedItems?: ItemOutlook[]
): CoverageResult {
  const items = precomputedItems ?? computeItemOutlooks(context);
  const { range } = context;

  const withQuantity = items.filter((item) => item.estimatedQuantity !== null);
  const withPrice = items.filter((item) => item.priceType !== 'unknown');
  const burnReady = items.filter((item) => item.dailyBurn !== null);

  // Chart 1: burn-rate readiness by data status.
  const statusCounts = new Map<string, number>();
  for (const item of items) {
    const label = BURN_STATUS_LABELS[item.dataStatus];
    statusCounts.set(label, (statusCounts.get(label) ?? 0) + 1);
  }
  const burnReadiness: BurnReadinessRow[] = Object.values(BURN_STATUS_LABELS)
    .filter((label, index, all) => all.indexOf(label) === index)
    .map((label) => ({ status: label, itemCount: statusCounts.get(label) ?? 0 }));

  // Chart 2: recording activity per local week across the range. Migration
  // baselines and deletion snapshots establish history/lifetime boundaries;
  // they are not user recording activity.
  const weekOf = (date: string): string => {
    // Weeks anchor to the range start date.
    const daysFromStart = Math.floor(
      (Date.parse(`${date}T00:00:00Z`) -
        Date.parse(`${range.startDate}T00:00:00Z`)) /
        86_400_000
    );
    return shiftLocalDate(range.startDate, Math.floor(daysFromStart / 7) * 7);
  };
  const activityByWeek = new Map<string, RecordingActivityRow>();
  for (
    let date = range.startDate;
    date <= range.endDate;
    date = shiftLocalDate(date, 7)
  ) {
    activityByWeek.set(date, {
      weekStart: date,
      eventCount: 0,
      quantityEvents: 0,
      priceEvents: 0,
      statusEvents: 0,
    });
  }
  let eventsInRange = 0;
  for (const timeline of context.timelines) {
    for (const event of timeline.events) {
      if (event.recordedAt < range.startUtc) continue;
      if (
        event.eventKind === 'migration_baseline' ||
        event.eventKind === 'deleted'
      ) {
        continue;
      }
      eventsInRange += 1;
      const localDate = localDateOf(event.recordedAt, range.timeZone);
      const week = activityByWeek.get(weekOf(localDate));
      if (!week) continue;
      week.eventCount += 1;
      if (event.recordsQuantity) week.quantityEvents += 1;
      if (event.recordsPrice) week.priceEvents += 1;
      if (event.recordsStatus) week.statusEvents += 1;
    }
  }

  // Detail: item-level data gaps, most-incomplete first.
  const gaps: DataGapRow[] = items.map((item) => {
    const timeline = context.timelines.find(
      (candidate) => candidate.sourceFoodItemId === item.foodItemId && candidate.isLive
    );
    let lastQuantityChangeAt: string | null = null;
    if (timeline) {
      for (const event of timeline.events) {
        if (event.recordsQuantity && event.eventKind !== 'migration_baseline') {
          lastQuantityChangeAt = event.recordedAt.toISOString();
        }
      }
    }
    return {
      foodItemId: item.foodItemId,
      name: item.name,
      categoryName: item.categoryName,
      hasQuantity: item.estimatedQuantity !== null,
      hasPrice: item.priceType !== 'unknown',
      burnReady: item.dailyBurn !== null,
      lastQuantityChangeAt,
    };
  });
  gaps.sort((a, b) => {
    const gapCount = (row: DataGapRow) =>
      Number(!row.hasQuantity) + Number(!row.hasPrice) + Number(!row.burnReady);
    return gapCount(b) - gapCount(a) || a.name.localeCompare(b.name);
  });

  const percent = (count: number): number | null =>
    items.length > 0 ? (count / items.length) * 100 : null;

  return {
    kpis: {
      liveItems: items.length,
      quantityCoveragePercent: percent(withQuantity.length),
      priceCoveragePercent: percent(withPrice.length),
      burnReadyPercent: percent(burnReady.length),
      eventsInRange,
    },
    burnReadiness,
    recordingActivity: [...activityByWeek.values()],
    gaps,
    dataAsOf: context.asOf.toISOString(),
  };
}
