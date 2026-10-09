// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Router } from 'express';
import { z } from 'zod';

import { Prisma } from '@prisma/client';

import prisma from '../db';

import { rateLimiter } from '../middleware/rate-limiter';
import { getProcurementAnalytics } from '../services/procurement';
import { getServiceAnalytics } from '../services/service/analytics';
import {
  computeOperationalAnalytics,
  getOperationalAnalyticsStartDate,
} from '../services/operational-analytics';
import {
  getAppliedOperatingHoursRevisions,
  getOperatingHoursSettings,
} from '../services/operating-hours';
import { resolveRange } from '../services/inventory-analytics/timezone';
import { ANALYTICS_CARDS, getAnalyticsCard } from '../services/reports/analytics-cards';
import { buildAnalyticsReport } from '../services/reports/analytics-report';
import { isValidLocalDate } from '../services/inventory-analytics/timezone';

/**
 * Report generation for the Analytics lenses.
 *
 * Mounted separately from `/api/reports`, which belongs to the operational
 * workspace, and from the dormant `routes/reports.ts`, whose card registry
 * still describes the claims RITE rejected (ISSUES #46). This route only knows
 * `ANALYTICS_CARDS` — every card it can render is one Analytics already shows,
 * so the report makes no claim the screen does not.
 *
 * One endpoint, one archive. There is deliberately no per-card export: that was
 * the workflow rejected during ideation.
 */
const router = Router();

const requestSchema = z
  .object({
    // Selection order is report order, so this array is ordered, not a set.
    cardIds: z.array(z.string().min(1)).min(1).max(8),
    title: z.string().trim().min(1).max(120).default('FEED Analytics Report'),
    includePdf: z.boolean().default(true),
    includeCsv: z.boolean().default(true),
    csvGrain: z.enum(['condensed', 'raw']).default('condensed'),
    // Each card's own controls, keyed by card id. Unvalidated shape by design:
    // a card owns the meaning of its options, and an unknown key is ignored
    // rather than rejected so an older client stays compatible.
    cardOptions: z.record(z.string(), z.unknown()).optional().default({}),
    // Mirrors the Analytics page's own query contract, so a report is generated
    // against exactly what the user was looking at.
    preset: z
      .enum(['last-7-days', 'last-30-days', 'last-90-days', 'ytd', 'all', 'custom'])
      .default('last-90-days'),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    channel: z.enum(['ofb_warehouse', 'fresh_alliance']).optional(),
    acquisitionClass: z.enum(['DONATED', 'PURCH-DON', 'GOVERNMENT', 'PURCHASED']).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.includePdf && !value.includeCsv) {
      context.addIssue({
        code: 'custom',
        path: ['includePdf'],
        message: 'Choose PDF, CSV, or both.',
      });
    }
    if (value.preset === 'custom') {
      if (!value.startDate || !isValidLocalDate(value.startDate)) {
        context.addIssue({ code: 'custom', path: ['startDate'], message: 'Choose a valid start date.' });
      }
      if (!value.endDate || !isValidLocalDate(value.endDate)) {
        context.addIssue({ code: 'custom', path: ['endDate'], message: 'Choose a valid end date.' });
      }
    }
  });

/** What the client can offer for selection. */
router.get('/cards', rateLimiter, (_req, res) => {
  res.json({
    cards: ANALYTICS_CARDS.map(card => ({
      id: card.id,
      title: card.defaultTitle,
      lens: card.lens,
      kind: card.kind,
    })),
  });
});

/**
 * Saved templates: a card selection to regenerate later, from Reports.
 *
 * `source` is `analytics` so these never collide with the dormant workspace's
 * templates, which describe cards this route cannot render.
 *
 * The stored payload deliberately omits the date range. A template is a
 * *shape* — which cards, in which order, under which filters — and the range is
 * chosen fresh each time it is run. Storing "last 90 days" would either freeze
 * a stale window or silently mean something different every month; storing
 * nothing makes the choice explicit at generate time.
 */
const templateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    cardIds: z.array(z.string().min(1)).min(1).max(8),
    channel: z.enum(['ofb_warehouse', 'fresh_alliance']).optional(),
    acquisitionClass: z.enum(['DONATED', 'PURCH-DON', 'GOVERNMENT', 'PURCHASED']).optional(),
    includePdf: z.boolean().default(true),
    includeCsv: z.boolean().default(true),
    csvGrain: z.enum(['condensed', 'raw']).default('condensed'),
    cardOptions: z.record(z.string(), z.unknown()).optional().default({}),
  })
  .strict();

const nameSearch = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

const bulkTemplateDeleteSchema = z
  .object({
    ids: z
      .array(z.number().int().positive())
      .min(1)
      .max(100)
      .refine(ids => new Set(ids).size === ids.length, {
        message: 'Each report template can only be selected once.',
      }),
  })
  .strict();

class TemplateSelectionChangedError extends Error {}

router.get('/templates', rateLimiter, async (_req, res, next) => {
  try {
    const templates = await prisma.reportTemplate.findMany({
      where: { source: 'analytics' },
      orderBy: { updatedAt: 'desc' },
    });
    return res.json({ templates });
  } catch (error) {
    return next(error);
  }
});

/** Create or update by name, matching the Shopping List Builder's save-by-name. */
router.post('/templates', rateLimiter, async (req, res, next) => {
  try {
    const parsed = templateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: {
          message: parsed.error.issues.map(issue => issue.message).join(' '),
          code: 'INVALID_TEMPLATE',
        },
      });
    }
    const { name, ...templateData } = parsed.data;

    const unknown = templateData.cardIds.filter(id => !getAnalyticsCard(id));
    if (unknown.length > 0) {
      return res.status(400).json({
        error: {
          message: `Unknown report cards: ${unknown.join(', ')}`,
          code: 'UNKNOWN_CARDS',
        },
      });
    }

    const template = await prisma.reportTemplate.upsert({
      where: { source_nameSearch: { source: 'analytics', nameSearch: nameSearch(name) } },
      create: {
        name: name.trim(),
        nameSearch: nameSearch(name),
        source: 'analytics',
        // Cast at the boundary: cardOptions is deliberately `unknown`-valued,
        // which Prisma's InputJsonValue cannot express. It is JSON by
        // construction — it arrived as parsed JSON.
        templateData: { schemaVersion: 1, ...templateData } as unknown as Prisma.InputJsonValue,
      },
      update: {
        name: name.trim(),
        templateData: { schemaVersion: 1, ...templateData } as unknown as Prisma.InputJsonValue,
      },
    });
    return res.status(201).json({ template });
  } catch (error) {
    return next(error);
  }
});

/**
 * Delete one table selection as one operation.
 *
 * Resolve every id inside the transaction before deleting anything. Reports
 * are shared across the organization, so a stale mixed selection must fail as
 * a unit rather than leaving the user to discover which subset disappeared.
 */
router.delete('/templates/bulk', rateLimiter, async (req, res, next) => {
  try {
    const parsed = bulkTemplateDeleteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: {
          message: parsed.error.issues.map(issue => issue.message).join(' '),
          code: 'INVALID_TEMPLATE_SELECTION',
          details: parsed.error.issues,
        },
      });
    }

    const result = await prisma.$transaction(async transaction => {
      const templates = await transaction.reportTemplate.findMany({
        where: { id: { in: parsed.data.ids }, source: 'analytics' },
        select: { id: true },
      });

      if (templates.length !== parsed.data.ids.length) {
        return { deleted: 0, missing: true } as const;
      }

      const deleted = await transaction.reportTemplate.deleteMany({
        where: { id: { in: parsed.data.ids }, source: 'analytics' },
      });
      // A concurrent deletion between the read and write must roll this
      // transaction back. Reporting a smaller success count would violate the
      // all-or-nothing confirmation the user just accepted.
      if (deleted.count !== parsed.data.ids.length) {
        throw new TemplateSelectionChangedError();
      }
      return { deleted: deleted.count, missing: false } as const;
    });

    if (result.missing) {
      return res.status(404).json({
        error: {
          message: 'One or more report templates no longer exist. Refresh the table and try again.',
          code: 'TEMPLATE_NOT_FOUND',
        },
      });
    }

    return res.json({ deleted: result.deleted });
  } catch (error) {
    if (error instanceof TemplateSelectionChangedError) {
      return res.status(404).json({
        error: {
          message: 'One or more report templates no longer exist. Refresh the table and try again.',
          code: 'TEMPLATE_NOT_FOUND',
        },
      });
    }
    return next(error);
  }
});

router.delete('/templates/:id', rateLimiter, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({
        error: { message: 'Unknown report template.', code: 'INVALID_TEMPLATE_ID' },
      });
    }
    // Scoped to this source so a stray id cannot reach the dormant workspace's
    // templates through this route.
    const deleted = await prisma.reportTemplate.deleteMany({
      where: { id, source: 'analytics' },
    });
    if (deleted.count === 0) {
      return res.status(404).json({
        error: { message: 'That report template no longer exists.', code: 'TEMPLATE_NOT_FOUND' },
      });
    }
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

router.post('/export', rateLimiter, async (req, res, next) => {
  try {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: {
          message: parsed.error.issues.map(issue => issue.message).join(' '),
          code: 'INVALID_REPORT_REQUEST',
          details: parsed.error.issues,
        },
      });
    }

    const { cardIds, title, includePdf, includeCsv, csvGrain, cardOptions, ...filters } =
      parsed.data;

    // Refuse a request that names nothing renderable, rather than returning an
    // archive holding only a manifest of what went missing.
    const known = cardIds.filter(id => getAnalyticsCard(id));
    if (known.length === 0) {
      return res.status(400).json({
        error: {
          message: 'None of the selected cards can be exported. Reselect and try again.',
          code: 'NO_EXPORTABLE_CARDS',
        },
      });
    }

    // Only load the lenses the selection actually needs. Operations resolves
    // its range against the pantry's operating-hours timezone and applied
    // schedule revisions, which Procurement knows nothing about, so the two
    // are computed separately rather than forced into one query.
    const lenses = new Set(cardIds.map(id => getAnalyticsCard(id)?.lens).filter(Boolean));

    const payloads: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      procurement?: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      operations?: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      service?: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      clients?: any;
    } = {};

    if (lenses.has('procurement')) {
      payloads.procurement = await getProcurementAnalytics(filters);
    }

    // Service resolves its own range and bucket grain from the preset, the
    // same call the screen makes, so a report and the page agree. Clients reads
    // the same analytics for now, so a report spanning both lenses runs the
    // query once rather than twice.
    if (lenses.has('service') || lenses.has('clients')) {
      const serviceAnalytics = await getServiceAnalytics(filters);
      if (lenses.has('service')) payloads.service = serviceAnalytics;
      if (lenses.has('clients')) payloads.clients = serviceAnalytics;
    }

    if (lenses.has('operations')) {
      const now = new Date();
      const schedule = await getOperatingHoursSettings();
      const allStart =
        filters.preset === 'all'
          ? await getOperationalAnalyticsStartDate(schedule.timezone)
          : null;
      const range = resolveRange(
        filters.preset,
        schedule.timezone,
        now,
        filters.preset === 'custom'
          ? { startDate: filters.startDate!, endDate: filters.endDate! }
          : undefined,
        allStart ?? undefined
      );
      const revisions = await getAppliedOperatingHoursRevisions(range.startDate, range.endDate);
      payloads.operations = await computeOperationalAnalytics(range, now, undefined, revisions);
    }

    const report = await buildAnalyticsReport(payloads, {
      cardIds,
      title,
      includePdf,
      includeCsv,
      csvGrain,
      cardOptions,
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
    // Lets the client tell the user which saved cards no longer exist without
    // opening the archive.
    if (report.unknownCardIds.length > 0) {
      res.setHeader('X-Unknown-Card-Ids', report.unknownCardIds.join(','));
    }
    return res.send(report.zip);
  } catch (error) {
    return next(error);
  }
});

export default router;
