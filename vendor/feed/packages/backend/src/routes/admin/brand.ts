// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';

import { oklchToHex } from '../../services/brand-theme/color';
import { TAILWIND_PALETTE, isNeutralFamily } from '../../services/brand-theme/palettes';
import prisma from '../../db';
import { auditActorFrom } from '../../middleware/auth/require-admin';
import {
  brandAssetResolutionWarnings,
  checkBrandAssetStorage,
  cleanupUnusedBrandAssets,
  describeLogoPresentation,
  prepareBrandAsset,
  storeBrandAsset,
  storeSquareBrandDerivative,
  type BrandAssetKind,
} from '../../services/brand-assets';
import {
  activateBrandConfiguration,
  brandAssetIds,
  deactivateBrandConfiguration,
  ensureBrandTemplates,
  previewBrandConfiguration,
  saveBrandConfiguration,
} from '../../services/brand-config';

const router = Router();
const MAX_BRAND_ASSET_BYTES = 4 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BRAND_ASSET_BYTES, files: 1 } });

router.get('/', async (_req, res, next) => {
  try {
    await ensureBrandTemplates();
    const configurations = await prisma.brandConfiguration.findMany({ orderBy: [{ isTemplate: 'desc' }, { updatedAt: 'desc' }] });
    return res.json({ configurations, activeId: configurations.find((row) => row.isActive)?.id ?? null });
  } catch (error) { return next(error); }
});

/**
 * The palette the appearance wizard is allowed to choose from.
 *
 * Served rather than duplicated in the frontend so `palettes.ts` stays the one
 * definition of what a brand colour may be. It never changes at runtime, so it
 * is safe to cache hard.
 */
router.get('/palette', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
  return res.json({
    palette: TAILWIND_PALETTE.map((entry) => ({
      name: `${entry.family}-${entry.stop}`,
      family: entry.family,
      stop: entry.stop,
      color: oklchToHex(entry),
      neutral: isNeutralFamily(entry.family),
    })),
  });
});

router.post('/preview', async (req, res, next) => {
  try { return res.json({ preview: previewBrandConfiguration(req.body?.payload) }); }
  catch (error) { return next(error); }
});

router.put('/:id', async (req, res, next) => {
  try {
    return res.json({ configuration: await saveBrandConfiguration(req.params.id, req.body?.payload, req.body?.activate === true) });
  } catch (error) { return next(error); }
});

router.post('/activate/:id', async (req, res, next) => {
  try { return res.json({ configuration: await activateBrandConfiguration(req.params.id) }); }
  catch (error) { return next(error); }
});

router.post('/deactivate', async (_req, res, next) => {
  try { await deactivateBrandConfiguration(); return res.json({ activeId: null }); }
  catch (error) { return next(error); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const row = await prisma.brandConfiguration.findUnique({ where: { id: req.params.id } });
    if (!row || row.isTemplate) return res.status(404).json({ error: { message: 'Choose a saved appearance configuration to delete.', code: 'BRAND_CONFIGURATION_NOT_FOUND' } });
    if (row.isActive) return res.status(409).json({ error: { message: 'Activate another appearance or return to the built-in appearance before deleting this one.', code: 'ACTIVE_BRAND_CONFIGURATION' } });
    const otherConfigurations = await prisma.brandConfiguration.findMany({
      where: { id: { not: row.id } }, select: { payload: true },
    });
    const retained = new Set(otherConfigurations.flatMap((configuration) => [...brandAssetIds(configuration.payload)]));
    const unreferenced = [...brandAssetIds(row.payload)].filter((id) => !retained.has(id));
    await prisma.$transaction([
      prisma.brandConfiguration.delete({ where: { id: req.params.id } }),
      prisma.brandAsset.deleteMany({ where: { id: { in: unreferenced } } }),
    ]);
    return res.status(204).end();
  } catch (error) { return next(error); }
});

router.post('/assets', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: { message: 'Choose a PNG, JPEG, WebP, or SVG image to upload.', code: 'BRAND_ASSET_REQUIRED' } });
    const kind = req.body?.kind as BrandAssetKind;
    if (!['logo-light', 'logo-dark', 'square'].includes(kind)) return res.status(400).json({ error: { message: 'Choose which brand image this upload should replace.', code: 'INVALID_BRAND_ASSET_KIND' } });
    const prepared = await prepareBrandAsset(req.file.buffer);
    if (kind === 'square' && Math.max(prepared.width, prepared.height) / Math.min(prepared.width, prepared.height) > 1.2) {
      throw Object.assign(new Error('The app mark needs to be square. Crop it to a square and upload it again.'), { statusCode: 400 });
    }
    const asset = await storeBrandAsset(prepared, req.file.originalname);
    const derivatives = kind === 'square'
      ? await Promise.all([64, 192, 512].map((size) => storeSquareBrandDerivative(prepared, req.file!.originalname, size)))
      : [];
    // Only the light logo can be invisible against the page it lands on; the
    // dark variant and the app mark are placed on surfaces we control.
    const presentation = kind === 'logo-light' ? await describeLogoPresentation(prepared) : null;
    return res.status(201).json({
      asset,
      derivatives,
      warnings: brandAssetResolutionWarnings(prepared, kind),
      presentation,
    });
  } catch (error) {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: { message: 'That image is larger than 4 MB. Export or compress a smaller copy and try again.', code: 'BRAND_ASSET_TOO_LARGE' } });
    return next(error);
  }
});

router.get('/assets/storage-check', async (_req, res, next) => {
  try {
    return res.json({ check: await checkBrandAssetStorage() });
  } catch (error) { return next(error); }
});

router.delete('/assets/unused', async (req, res, next) => {
  try {
    const cleanup = await cleanupUnusedBrandAssets(auditActorFrom(req));
    return res.json({ cleanup, check: await checkBrandAssetStorage() });
  } catch (error) { return next(error); }
});

/**
 * Router-level translation of storage failures into ASK-compliant messages.
 *
 * Everything above delegates to `next(error)`, which reaches the global handler
 * and reports the deliberately generic internal-failure message. That is right
 * for an unknown fault and wrong for a knowable one: an un-migrated deployment
 * fails *every* appearance mutation, and answering "could not complete that
 * request" tells an administrator nothing they can act on. The remaining cases
 * still fall through, so this narrows the generic message rather than replacing
 * it.
 */
router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  const raw = error instanceof Error ? error.message : '';

  if (/does not exist in the current database|no such table/i.test(raw)) {
    return res.status(503).json({
      error: {
        message:
          'Appearance storage has not been set up on this deployment yet, so this could not be saved. Run the pending database migrations, then try again.',
        code: 'BRAND_STORAGE_UNAVAILABLE',
      },
    });
  }

  if (/UNIQUE constraint failed|Unique constraint/i.test(raw)) {
    return res.status(409).json({
      error: {
        message:
          'Another appearance is already active. Return to the built-in appearance first, then activate this one.',
        code: 'BRAND_CONFIGURATION_CONFLICT',
      },
    });
  }

  return next(error);
});

export default router;
