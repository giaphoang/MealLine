// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import type { AnalyticsReportTemplate } from '@/services/analytics-reports';

/**
 * What a saved template holds, read back defensively.
 *
 * `templateData` is JSON written by whichever client saved it, so nothing in it
 * can be trusted to have the shape the current code expects. Everything is
 * narrowed here, once, and the rest of the page works from the result — the
 * alternative is every consumer re-guessing at `unknown`.
 *
 * The date range is deliberately absent: a template is a *shape*, and the range
 * is chosen when it is run.
 */

export interface AnalyticsTemplateSpec {
  /** Ordered — this is the report's order. */
  cardIds: string[];
  channel?: 'ofb_warehouse' | 'fresh_alliance';
  acquisitionClass?: 'DONATED' | 'PURCH-DON' | 'GOVERNMENT' | 'PURCHASED';
  includePdf: boolean;
  includeCsv: boolean;
  csvGrain: 'condensed' | 'raw';
  cardOptions: Record<string, unknown>;
}

/** The words the Analytics page uses, so a template reads the same as the screen. */
const CHANNEL_LABELS: Record<string, string> = {
  ofb_warehouse: 'OFB Warehouse',
  fresh_alliance: 'Fresh Food Alliance',
};

const ACQUISITION_LABELS: Record<string, string> = {
  DONATED: 'Donated',
  'PURCH-DON': 'Purch-Don',
  GOVERNMENT: 'Government',
  PURCHASED: 'Purchased',
};

export function parseTemplateSpec(template: AnalyticsReportTemplate): AnalyticsTemplateSpec {
  const data = (template.templateData ?? {}) as Record<string, unknown>;

  return {
    cardIds: Array.isArray(data.cardIds)
      ? data.cardIds.filter((id): id is string => typeof id === 'string')
      : [],
    channel:
      data.channel === 'ofb_warehouse' || data.channel === 'fresh_alliance'
        ? data.channel
        : undefined,
    acquisitionClass:
      typeof data.acquisitionClass === 'string' && data.acquisitionClass in ACQUISITION_LABELS
        ? (data.acquisitionClass as AnalyticsTemplateSpec['acquisitionClass'])
        : undefined,
    // Defaulted the way the server defaults them: absent means on.
    includePdf: data.includePdf !== false,
    includeCsv: data.includeCsv !== false,
    csvGrain: data.csvGrain === 'raw' ? 'raw' : 'condensed',
    cardOptions:
      typeof data.cardOptions === 'object' && data.cardOptions !== null
        ? (data.cardOptions as Record<string, unknown>)
        : {},
  };
}

/**
 * Which of a template's cards the server can still render.
 *
 * `cardTitles` is null when the registry has not loaded or the lookup failed.
 * That is not the same as an empty registry: an empty map would mean every
 * saved card had been removed, so an unread registry reports nothing missing
 * and lets the server decide. Being wrong quietly is better than accusing the
 * user's templates of being broken because a request failed.
 */
export function cardAvailability(
  spec: AnalyticsTemplateSpec,
  cardTitles: Record<string, string> | null
): { available: string[]; missing: string[] } {
  if (cardTitles === null) return { available: spec.cardIds, missing: [] };
  return {
    available: spec.cardIds.filter(id => cardTitles[id] !== undefined),
    missing: spec.cardIds.filter(id => cardTitles[id] === undefined),
  };
}

/** "PDF + CSV (condensed)" — what lands in the ZIP. */
export function outputsLabel(spec: AnalyticsTemplateSpec): string {
  const parts = [
    spec.includePdf ? 'PDF' : null,
    spec.includeCsv ? `CSV (${spec.csvGrain})` : null,
  ].filter(Boolean);
  return parts.join(' + ') || '—';
}

/** The filters this template pins. Never the date range — that is not stored. */
export function scopeLabel(spec: AnalyticsTemplateSpec): string {
  const parts = [
    spec.channel ? CHANNEL_LABELS[spec.channel] : null,
    spec.acquisitionClass ? ACQUISITION_LABELS[spec.acquisitionClass] : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'All channels';
}
