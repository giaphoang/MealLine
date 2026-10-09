// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Scarcity & Availability tab (Reports initiative §2).
 *
 * Stockout episodes end through restock, range end, or deletion; only
 * actual restocks contribute to restock-time averages. Availability
 * aggregates use item-days (valid aggregate), never quantities. Untracked
 * time (before an item's first event) contributes nothing.
 */

import { median } from './calculations';
import { AnalyticsContext, ItemTimeline } from './data';
import { localDateOf, localDateStartUtc, shiftLocalDate } from './timezone';

const MS_PER_DAY = 86_400_000;

export type EpisodeEnd = 'restock' | 'deletion' | 'range-end';

export interface StockoutEpisode {
  sourceFoodItemId: number;
  itemName: string;
  categoryName: string;
  isLive: boolean;
  startAt: string;
  /** null while ongoing at the range end. */
  endAt: string | null;
  endedBy: EpisodeEnd;
  durationDays: number;
}

export interface AvailabilityPoint {
  /** Local calendar date sampled at its local midnight. */
  date: string;
  trackedItems: number;
  inStockItems: number;
  availabilityPercent: number | null;
}

export interface StockoutFrequencyRow {
  sourceFoodItemId: number;
  itemName: string;
  episodeCount: number;
  totalOutDays: number;
}

export interface ScarcityKpis {
  /** In-stock item-days ÷ tracked item-days across the range. */
  availabilityItemDaysPercent: number | null;
  stockoutEpisodes: number;
  itemsWithStockout: number;
  ongoingStockouts: number;
  /** Mean days out for episodes that ended in an actual restock. */
  averageRestockDays: number | null;
  medianRestockDays: number | null;
}

export interface ScarcityResult {
  kpis: ScarcityKpis;
  availabilityOverTime: AvailabilityPoint[];
  stockoutFrequency: StockoutFrequencyRow[];
  episodes: StockoutEpisode[];
  dataAsOf: string;
}

const FREQUENCY_ROW_LIMIT = 10;
/** Sample weekly instead of daily when the range exceeds this many days. */
const DAILY_SAMPLING_LIMIT = 120;

interface StatusSegment {
  from: Date;
  to: Date;
  isInStock: boolean;
  endedBy: EpisodeEnd;
}

/**
 * Stock-status step function clipped to [range start, range end) and the
 * item's tracked lifetime. The anchor event (latest before range start)
 * seeds the initial status.
 */
function statusSegments(
  timeline: ItemTimeline,
  context: AnalyticsContext
): StatusSegment[] {
  const { startUtc, endUtc } = context.range;
  const observedEnd = new Date(
    Math.min(endUtc.getTime(), context.asOf.getTime())
  );
  if (observedEnd <= startUtc) return [];
  const lifetimeEnd = timeline.deletedAt && timeline.deletedAt < observedEnd
    ? timeline.deletedAt
    : observedEnd;

  const segments: StatusSegment[] = [];
  let currentStatus: boolean | null = null;
  let segmentStart: Date | null = null;

  const closeSegment = (to: Date, endedBy: EpisodeEnd) => {
    if (currentStatus !== null && segmentStart !== null && to > segmentStart) {
      segments.push({ from: segmentStart, to, isInStock: currentStatus, endedBy });
    }
  };

  for (const event of timeline.events) {
    if (event.recordedAt >= lifetimeEnd) break;
    if (event.eventKind === 'deleted') break;
    const at = event.recordedAt < startUtc ? startUtc : event.recordedAt;
    if (currentStatus === null) {
      currentStatus = event.isInStock;
      segmentStart = at;
      continue;
    }
    if (event.isInStock !== currentStatus) {
      closeSegment(at, 'restock');
      currentStatus = event.isInStock;
      segmentStart = at;
    }
  }

  closeSegment(
    lifetimeEnd,
    timeline.deletedAt && lifetimeEnd === timeline.deletedAt
      ? 'deletion'
      : 'range-end'
  );

  return segments;
}

export function buildScarcity(context: AnalyticsContext): ScarcityResult {
  const { range, asOf } = context;

  let trackedMs = 0;
  let inStockMs = 0;
  const episodes: StockoutEpisode[] = [];
  const frequencyBySource = new Map<number, StockoutFrequencyRow>();

  for (const timeline of context.timelines) {
    const segments = statusSegments(timeline, context);
    for (const segment of segments) {
      const durationMs = segment.to.getTime() - segment.from.getTime();
      trackedMs += durationMs;
      if (segment.isInStock) {
        inStockMs += durationMs;
        continue;
      }

      const ongoing = segment.endedBy === 'range-end' && timeline.isLive;
      const durationDays = durationMs / MS_PER_DAY;
      episodes.push({
        sourceFoodItemId: timeline.sourceFoodItemId,
        itemName: timeline.name,
        categoryName: timeline.categoryName,
        isLive: timeline.isLive,
        startAt: segment.from.toISOString(),
        endAt: ongoing ? null : segment.to.toISOString(),
        endedBy: segment.endedBy,
        durationDays,
      });

      const row = frequencyBySource.get(timeline.sourceFoodItemId) ?? {
        sourceFoodItemId: timeline.sourceFoodItemId,
        itemName: timeline.name,
        episodeCount: 0,
        totalOutDays: 0,
      };
      row.episodeCount += 1;
      row.totalOutDays += durationDays;
      frequencyBySource.set(timeline.sourceFoodItemId, row);
    }
  }

  episodes.sort((a, b) => b.startAt.localeCompare(a.startAt));

  const restockDurations = episodes
    .filter((episode) => episode.endedBy === 'restock')
    .map((episode) => episode.durationDays);

  const kpis: ScarcityKpis = {
    availabilityItemDaysPercent:
      trackedMs > 0 ? (inStockMs / trackedMs) * 100 : null,
    stockoutEpisodes: episodes.length,
    itemsWithStockout: frequencyBySource.size,
    ongoingStockouts: episodes.filter((episode) => episode.endAt === null)
      .length,
    averageRestockDays:
      restockDurations.length > 0
        ? restockDurations.reduce((sum, value) => sum + value, 0) /
          restockDurations.length
        : null,
    medianRestockDays: median(restockDurations),
  };

  // Chart 1: availability over time, sampled at local midnights (weekly
  // for long ranges to keep the series readable).
  const availabilityOverTime: AvailabilityPoint[] = [];
  const observedEnd = new Date(
    Math.min(range.endUtc.getTime(), asOf.getTime())
  );
  const observedEndDate = observedEnd <= range.startUtc
    ? null
    : localDateOfObservedEnd(observedEnd, range.timeZone);
  const rangeDays = Math.max(
    0,
    (observedEnd.getTime() - range.startUtc.getTime()) / MS_PER_DAY
  );
  const stepDays = rangeDays > DAILY_SAMPLING_LIMIT ? 7 : 1;
  for (
    let date = range.startDate;
    observedEndDate !== null && date <= observedEndDate;
    date = shiftLocalDate(date, stepDays)
  ) {
    const instant = localDateStartUtc(date, range.timeZone);
    let tracked = 0;
    let inStock = 0;
    for (const timeline of context.timelines) {
      if (timeline.firstTrackedAt === null || instant < timeline.firstTrackedAt) continue;
      if (timeline.deletedAt !== null && instant >= timeline.deletedAt) continue;
      let latestStatus: boolean | null = null;
      for (const event of timeline.events) {
        if (event.recordedAt > instant) break;
        latestStatus = event.isInStock;
      }
      if (latestStatus === null) continue;
      tracked += 1;
      if (latestStatus) inStock += 1;
    }
    availabilityOverTime.push({
      date,
      trackedItems: tracked,
      inStockItems: inStock,
      availabilityPercent: tracked > 0 ? (inStock / tracked) * 100 : null,
    });
  }

  // Chart 2: stockout frequency (most-affected items first).
  const stockoutFrequency = [...frequencyBySource.values()]
    .sort(
      (a, b) =>
        b.episodeCount - a.episodeCount || b.totalOutDays - a.totalOutDays
    )
    .slice(0, FREQUENCY_ROW_LIMIT);

  return {
    kpis,
    availabilityOverTime,
    stockoutFrequency,
    episodes,
    dataAsOf: asOf.toISOString(),
  };
}

/** Last local date containing observed time in the half-open snapshot. */
function localDateOfObservedEnd(observedEnd: Date, timeZone: string): string {
  return localDateOf(new Date(observedEnd.getTime() - 1), timeZone);
}
