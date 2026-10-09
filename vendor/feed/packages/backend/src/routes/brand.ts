// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { Router } from 'express';
import prisma from '../db';
import { publicBrandPayload, themeCss } from '../services/brand-config';

const router = Router();

router.get('/theme.css', async (req, res, next) => {
  try {
    const { body, etag } = await themeCss('oklch');
    res.setHeader('Content-Type', 'text/css; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('ETag', etag);
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    return res.status(200).send(body);
  } catch (error) {
    return next(error);
  }
});

router.get('/current', async (_req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-cache');
    return res.json({ brand: await publicBrandPayload() });
  } catch (error) {
    return next(error);
  }
});

router.get('/assets/:id', async (req, res, next) => {
  try {
    const asset = await prisma.brandAsset.findUnique({ where: { id: req.params.id } });
    if (!asset) return res.status(404).json({ error: { message: 'That brand image is no longer available.', code: 'BRAND_ASSET_NOT_FOUND' } });
    const bytes = Buffer.from(asset.dataBase64, 'base64');
    const etag = `"${asset.id}-${bytes.length}"`;
    res.setHeader('Content-Type', asset.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (asset.mimeType === 'image/svg+xml') {
      // The upload sanitizer is the primary boundary. This CSP keeps a stored
      // SVG inert even if a future sanitizer regression misses active content.
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    }
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('ETag', etag);
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    return res.send(bytes);
  } catch (error) {
    return next(error);
  }
});

export default router;
