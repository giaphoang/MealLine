// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import path from 'path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { rateLimiter } from '../middleware/rate-limiter';
import { requireAdmin } from '../middleware/auth/require-admin';
import {
  ANALYTICS_RANGE_PRESETS,
  isValidLocalDate,
} from '../services/inventory-analytics/timezone';
import { importUnifiedOfbCsv } from '../services/procurement/unified';
import { importLegacyLedgerCsv } from '../services/procurement/legacy-community';
import {
  ALL_FLAGS,
  DATA_SHAPING_CATALOG,
  DataShapingFlag,
  PROCUREMENT_RULE_SOURCES,
  RULE_SCOPES,
  RuleScope,
} from '../services/procurement/data-shaping';
import {
  createDataShapingRule,
  deleteDataShapingRule,
  getProcurementDataStatus,
  getProcurementAnalytics,
  listDataShapingRules,
  listProcurementImports,
  ProcurementImportError,
  restoreProcurementImports,
  rollbackProcurementImports,
  updateDataShapingRule,
} from '../services/procurement';

const router = Router();
/**
 * Upload ceiling for a procurement import.
 *
 * Raised from 5MB. That original limit was inherited from the document
 * translator, whose rationale does not transfer: the translator *stores*
 * uploads, while an import holds one buffer in memory and discards it.
 *
 * 10MB is bounded by transaction time, not disk or memory. The production Pi
 * runs ~1.8s per MB of OFB export, so a full 10MB file lands near 18s against
 * the 30s transaction ceiling in `db.ts` — roughly 60% utilisation, leaving
 * room for a slower SD card or a pickup-heavy file that costs more queries per
 * row. Memory is nowhere near binding at this size (~18MB of RAM per MB of
 * CSV, so ~180MB here).
 *
 * Past ~16MB the cap stops being the right lever and the transaction ceiling
 * becomes the thing to raise. See
 * docs/data-management/import-throughput-evaluation-plan.md §7.
 */
const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMPORT_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (path.extname(file.originalname).toLowerCase() !== '.csv') {
      callback(new ProcurementImportError(
        'Choose a CSV created by the standardized OFB exporter.',
        'INVALID_OFB_FILE_TYPE'
      ));
      return;
    }
    callback(null, true);
  },
});

const idsSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(100),
}).strict();

const analyticsQuerySchema = z.object({
  preset: z.enum(ANALYTICS_RANGE_PRESETS).default('last-90-days'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  channel: z.enum(['ofb_warehouse', 'fresh_alliance']).optional(),
  acquisitionClass: z.enum(['DONATED', 'PURCH-DON', 'GOVERNMENT', 'PURCHASED']).optional(),
}).strict().superRefine((value, context) => {
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

router.get('/imports', rateLimiter, async (_req, res, next) => {
  try {
    res.json({ imports: await listProcurementImports() });
  } catch (error) {
    next(error);
  }
});

router.get('/status', rateLimiter, async (_req, res, next) => {
  try {
    res.json({ status: await getProcurementDataStatus() });
  } catch (error) {
    next(error);
  }
});

router.get('/analytics', rateLimiter, async (_req, res, next) => {
  try {
    const filters = analyticsQuerySchema.parse(_req.query);
    res.json({ analytics: await getProcurementAnalytics(filters) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: {
          message: 'Choose valid procurement filters and try again.',
          code: 'INVALID_PROCUREMENT_FILTERS',
          details: error.issues,
        },
      });
    }
    next(error);
  }
});

// One import action for the unified OFB export -- one Order History action
// on the extension side produces one file covering Warehouse Completed
// orders plus Fresh Alliance Pending and Completed pickups. The two
// single-channel exports this replaced are no longer accepted; nothing in
// production ever depended on them (see procurement-unification-plan.md).
router.post('/imports', rateLimiter, upload.single('file'), async (req, res, next) => {
  // Declared outside the try so a failure can be timed too. A slow import that
  // fails is more diagnostic than a fast one that succeeds: it tells us which
  // ceiling was hit.
  const importStartedAt = Date.now();
  try {
    if (!req.file) {
      return res.status(400).json({
        error: {
          message: 'Select an OFB CSV before importing data.',
          code: 'NO_OFB_FILE',
        },
      });
    }
    // Timed because this is the one operation whose cost depends on the host
    // it runs on. The same file that finishes in a second on a developer SSD
    // took long enough on the production Pi's SD card to hit the transaction
    // ceiling, and there was no way to tell from the outside whether the time
    // went to parsing, the database, or the network. One line in the log
    // answers that without attaching a profiler to production.
    const result = await importUnifiedOfbCsv(req.file.buffer, req.auth?.userId);
    const elapsedMs = Date.now() - importStartedAt;
    // One line, `key=value`. Passing an object to console.log makes Node
    // pretty-print it across nine lines, so `docker compose logs | grep` on the
    // Pi returned the header and none of the numbers — which is the whole point
    // of the log. Single-line keeps it greppable and awk-able over SSH.
    const rowCount = (result.warehouse?.rowCount ?? 0) + (result.freshAlliance?.rowCount ?? 0);
    console.log(
      '[procurement] unified import complete' +
      ` outcome=${result.outcome}` +
      ` elapsedMs=${elapsedMs}` +
      ` fileBytes=${req.file.size}` +
      ` rows=${rowCount}` +
      ` warehouseOrders=${result.warehouse?.orderCount ?? 0}` +
      ` pickups=${result.freshAlliance?.pickupCount ?? 0}`
    );
    res.status(result.outcome === 'imported' ? 201 : 200).json({ result });
  } catch (error) {
    // Single-line for the same reason as the success path. `P2028` is Prisma's
    // interactive-transaction timeout; surfacing the code distinguishes "this
    // host is too slow for the ceiling" from a genuine data problem, which the
    // user-facing message cannot. The message is last because it is the only
    // field that can contain spaces.
    // Prisma error messages are themselves multi-line (P2028 spans several,
    // with indentation), so the message is flattened. Without this the error
    // path would break `grep` exactly the way the object form did.
    const flatMessage = (error instanceof Error ? error.message : String(error))
      .replace(/\s+/g, ' ')
      .trim();
    console.error(
      '[procurement] unified import failed' +
      ` elapsedMs=${Date.now() - importStartedAt}` +
      ` fileBytes=${req.file?.size ?? 0}` +
      ` code=${(error as { code?: string })?.code ?? 'none'}` +
      ` message=${flatMessage}`
    );
    if (error instanceof ProcurementImportError) {
      return res.status(error.statusCode).json({
        error: {
          message: error.message,
          code: error.code,
          details: error.details,
        },
      });
    }
    next(error);
  }
});

// The legacy sidecar (D22). Deliberately its own endpoint rather than another
// branch of the drop-zone above: the standard flow stays "drop an OFB export",
// which is what every agency uses, and this path teaches the system nothing
// general. It accepts only the curated community-donation ledger.
router.post('/imports/legacy', rateLimiter, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: {
          message: 'Select the curated community-donation ledger before importing.',
          code: 'NO_LEGACY_FILE',
        },
      });
    }
    const result = await importLegacyLedgerCsv(req.file.buffer, req.auth?.userId);
    res.status(result.outcome === 'imported' ? 201 : 200).json({ result });
  } catch (error) {
    if (error instanceof ProcurementImportError) {
      return res.status(error.statusCode).json({
        error: { message: error.message, code: error.code, details: error.details },
      });
    }
    next(error);
  }
});

router.post('/imports/rollback', rateLimiter, requireAdmin, async (req, res, next) => {
  try {
    const { ids } = idsSchema.parse(req.body);
    res.json({ result: await rollbackProcurementImports(ids, req.auth?.userId) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: {
          message: 'Select at least one valid import to roll back.',
          code: 'INVALID_IMPORT_SELECTION',
          details: error.issues,
        },
      });
    }
    next(error);
  }
});

router.post('/imports/restore', rateLimiter, requireAdmin, async (req, res, next) => {
  try {
    const { ids } = idsSchema.parse(req.body);
    res.json({ result: await restoreProcurementImports(ids, req.auth?.userId) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: {
          message: 'Select at least one valid import to restore.',
          code: 'INVALID_IMPORT_SELECTION',
          details: error.issues,
        },
      });
    }
    next(error);
  }
});

// Data-shaping rules (D20). These live under procurement because they classify
// procurement observations, but they are authored from Data Management -- never
// from Analytics, which only reads the result.
const ruleBodySchema = z.object({
  flag: z.enum(ALL_FLAGS as [DataShapingFlag, ...DataShapingFlag[]]),
  scope: z.enum(RULE_SCOPES as unknown as [RuleScope, ...RuleScope[]]),
  donorName: z.string().trim().min(1).max(200).nullish(),
  donorCode: z.string().trim().min(1).max(50).nullish(),
  productCode: z.string().trim().min(1).max(50).nullish(),
  orderRevisionId: z.number().int().positive().nullish(),
  source: z.enum(PROCUREMENT_RULE_SOURCES).nullish(),
  startDate: z.string().refine(isValidLocalDate, 'Use YYYY-MM-DD.').nullish(),
  endDate: z.string().refine(isValidLocalDate, 'Use YYYY-MM-DD.').nullish(),
  enabled: z.boolean().optional(),
  note: z.string().trim().max(500).nullish(),
});

const ruleIdSchema = z.coerce.number().int().positive();

router.get('/rules', rateLimiter, async (_req, res, next) => {
  try {
    res.json({ rules: await listDataShapingRules(), catalog: DATA_SHAPING_CATALOG });
  } catch (error) {
    next(error);
  }
});

router.post('/rules', rateLimiter, requireAdmin, async (req, res, next) => {
  try {
    const body = ruleBodySchema.parse(req.body);
    res.status(201).json({ rule: await createDataShapingRule(body, req.auth?.userId) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: {
          message: 'That rule is not well-formed.',
          code: 'INVALID_DATA_RULE',
          details: error.issues,
        },
      });
    }
    next(error);
  }
});

router.put('/rules/:id', rateLimiter, requireAdmin, async (req, res, next) => {
  try {
    const id = ruleIdSchema.parse(req.params.id);
    const body = ruleBodySchema.partial().parse(req.body);
    res.json({ rule: await updateDataShapingRule(id, body) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: {
          message: 'That rule is not well-formed.',
          code: 'INVALID_DATA_RULE',
          details: error.issues,
        },
      });
    }
    next(error);
  }
});

router.delete('/rules/:id', rateLimiter, requireAdmin, async (req, res, next) => {
  try {
    const id = ruleIdSchema.parse(req.params.id);
    await deleteDataShapingRule(id);
    res.status(204).end();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: { message: 'Choose a valid rule.', code: 'INVALID_DATA_RULE', details: error.issues },
      });
    }
    next(error);
  }
});

export default router;
