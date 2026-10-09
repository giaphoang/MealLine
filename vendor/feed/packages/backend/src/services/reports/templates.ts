// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Shared report templates (Reports initiative §3). Organization-wide, no
 * owner scoping. Template data stores configuration only — ordered card
 * ids, relative preset or exact custom dates, timezone, filters, horizon —
 * never computed data, resolved preset dates, or generated files.
 * Relative presets resolve fresh whenever applied; custom dates stay
 * exact. Stale card ids are surfaced as "needs attention", never silently
 * discarded.
 */

import { z } from 'zod';
import {
  isValidLocalDate,
  isValidTimeZone,
} from '../inventory-analytics/timezone';
import {
  getReportCard,
  MAX_REPORT_SELECTION,
  ReportSource,
} from './card-registry';

export const TEMPLATE_SCHEMA_VERSION = 1;
export const TEMPLATE_NAME_MIN = 3;
export const TEMPLATE_NAME_MAX = 48;

export const reportFiltersSchema = z.object({
  categoryIds: z.array(z.number().int().positive()).max(200).optional(),
  stockStatuses: z.array(z.enum(['in-stock', 'out-of-stock'])).max(2).optional(),
  priceTypes: z.array(z.enum(['unknown', 'donated', 'paid'])).max(3).optional(),
  search: z.string().trim().max(100).optional(),
}).strict();

export const templateRangeSchema = z
  .object({
    preset: z.enum([
      'last-30-days',
      'last-90-days',
      'last-6-months',
      'last-12-months',
      'ytd',
      'custom',
    ]),
    timeZone: z.string().refine(isValidTimeZone, {
      message: 'timeZone must be a valid IANA timezone',
    }),
    startDate: z.string().refine(isValidLocalDate).optional(),
    endDate: z.string().refine(isValidLocalDate).optional(),
  })
  .refine(
    (range) => range.preset !== 'custom' || (range.startDate && range.endDate),
    { message: 'Custom ranges require startDate and endDate' }
  );

export const templateDataSchema = z.object({
  schemaVersion: z.literal(TEMPLATE_SCHEMA_VERSION),
  source: z.enum(['reports', 'dashboard']),
  // Ordered. Cards may go stale after a registry change; reads surface
  // them instead of discarding, so no registry check happens here.
  cardIds: z.array(z.string().min(1)).min(1).max(MAX_REPORT_SELECTION),
  range: templateRangeSchema,
  horizonDays: z.union([
    z.literal(14),
    z.literal(30),
    z.literal(60),
    z.literal(90),
  ]),
  filters: reportFiltersSchema.optional().default({}),
  cardOptions: z.record(z.string(), z.unknown()).optional().default({}),
  // Read compatibility for templates created before the nested filter
  // contract landed. New writes use `filters.categoryIds`.
  categoryIds: z.array(z.number().int().positive()).max(200).optional(),
}).superRefine((data, context) => {
  if (data.source === 'dashboard' && data.horizonDays !== 30) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['horizonDays'],
      message: 'Dashboard templates use a 30-day planning horizon',
    });
  }
});

export type ReportTemplateData = z.infer<typeof templateDataSchema>;

export const normalizeTemplateName = (name: string): string =>
  name.trim().replace(/\s+/g, ' ');

export const templateNameSearch = (name: string): string =>
  normalizeTemplateName(name).toLowerCase();

/** Card ids a template holds that the registry no longer recognizes for its source. */
export function staleCardIds(
  source: ReportSource,
  cardIds: string[]
): string[] {
  return cardIds.filter((id) => {
    const card = getReportCard(id);
    return !card || card.source !== source;
  });
}
