// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  brandAsset: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  brandConfiguration: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    delete: vi.fn(),
  },
  adminAuditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('../../../src/db', () => ({ default: mockPrisma }));

import adminBrandRouter from '../../../src/routes/admin/brand';
import publicBrandRouter from '../../../src/routes/brand';

const app = express();
app.use(express.json());
app.use('/api/admin/brand', adminBrandRouter);
app.use('/api/brand', publicBrandRouter);
app.use((error: Error & { statusCode?: number; code?: string }, _req: Request, res: Response, _next: NextFunction) => {
  res.status(error.statusCode ?? 500).json({ error: { message: error.message, code: error.code } });
});

const createdAsset = (index = 0) => mockPrisma.brandAsset.create.mock.calls[index]?.[0].data as {
  id: string;
  filename: string;
  mimeType: string;
  width: number;
  height: number;
  dataBase64: string;
};

describe('brand asset upload and storage routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.brandAsset.create.mockResolvedValue({});
    mockPrisma.$transaction.mockImplementation(async (callback: (client: typeof mockPrisma) => Promise<unknown>) => callback(mockPrisma));
    mockPrisma.adminAuditLog.create.mockResolvedValue({});
  });

  it('preserves SVG vector output while removing active and remote content', async () => {
    const svg = Buffer.from(`
      <?xml version="1.0"?>
      <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="360" viewBox="0 0 1200 360" onload="alert(1)" xml:base="https://tracker.example/">
        <style>.brand { fill: #067a46; }</style>
        <script>alert('unsafe')</script>
        <image href="https://tracker.example/logo.png" width="20" height="20" />
        <use href="https://tracker.example/sprite.svg#mark" />
        <rect class="brand" width="1200" height="360" style="fill:url(https://tracker.example/fill.svg)" />
      </svg>
    `);

    const response = await request(app)
      .post('/api/admin/brand/assets')
      .field('kind', 'logo-light')
      .attach('file', svg, { filename: 'wide-logo.svg', contentType: 'image/svg+xml' })
      .expect(201);

    expect(response.body.asset).toMatchObject({
      kind: 'database', mimeType: 'image/svg+xml', width: 1200, height: 360,
    });
    expect(response.body.warnings).toEqual([]);
    const stored = createdAsset();
    expect(stored.mimeType).toBe('image/svg+xml');
    expect(stored.width).toBe(1200);
    expect(stored.height).toBe(360);
    const sanitized = Buffer.from(stored.dataBase64, 'base64').toString('utf8');
    expect(sanitized).toContain('.brand { fill: #067a46; }');
    expect(sanitized).toContain('viewBox="0 0 1200 360"');
    expect(sanitized).not.toMatch(/script|onload|tracker\.example|<image/i);
  });

  it('keeps a PNG at its original resolution and warns when it is too small for a high-density logo slot', async () => {
    const png = await sharp({
      create: { width: 288, height: 87, channels: 4, background: '#067a46' },
    }).png().toBuffer();

    const response = await request(app)
      .post('/api/admin/brand/assets')
      .field('kind', 'logo-dark')
      .attach('file', png, { filename: 'small-logo.png', contentType: 'image/png' })
      .expect(201);

    expect(response.body.asset).toMatchObject({ mimeType: 'image/png', width: 288, height: 87 });
    expect(response.body.warnings).toEqual([
      expect.stringMatching(/288 × 87 px.*576 × 160 px/i),
    ]);
    const stored = createdAsset();
    const metadata = await sharp(Buffer.from(stored.dataBase64, 'base64')).metadata();
    expect(metadata).toMatchObject({ format: 'png', width: 288, height: 87 });
  });

  it('generates crisp fixed-size PNG derivatives from a square SVG', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="15" fill="#067a46"/></svg>');
    const response = await request(app)
      .post('/api/admin/brand/assets')
      .field('kind', 'square')
      .attach('file', svg, { filename: 'mark.svg', contentType: 'image/svg+xml' })
      .expect(201);

    expect(response.body.asset).toMatchObject({ mimeType: 'image/svg+xml', width: 32, height: 32 });
    expect(response.body.derivatives.map((asset: { width: number; height: number; mimeType: string }) => [asset.width, asset.height, asset.mimeType]))
      .toEqual([[64, 64, 'image/png'], [192, 192, 'image/png'], [512, 512, 'image/png']]);
    expect(mockPrisma.brandAsset.create).toHaveBeenCalledTimes(4);
  });

  it('serves sanitized SVGs with an inert response policy', async () => {
    mockPrisma.brandAsset.findUnique.mockResolvedValue({
      id: 'asset-vector',
      filename: 'logo.svg',
      mimeType: 'image/svg+xml',
      width: 1200,
      height: 360,
      dataBase64: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 3"><path d="M0 0h10v3H0z"/></svg>').toString('base64'),
    });

    const response = await request(app).get('/api/brand/assets/asset-vector').expect(200);
    expect(response.headers['content-type']).toMatch(/image\/svg\+xml/);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['content-security-policy']).toContain('sandbox');
  });

  it('finds and deletes only unreferenced assets older than the grace period', async () => {
    const now = Date.now();
    mockPrisma.brandConfiguration.findMany.mockResolvedValue([
      { payload: { logo: { light: { kind: 'database', id: 'used' } } } },
    ]);
    mockPrisma.brandAsset.findMany
      .mockResolvedValueOnce([
        { id: 'used', filename: 'used.svg', mimeType: 'image/svg+xml', width: 100, height: 30, dataBase64: 'AA==', createdAt: new Date(now - 48 * 60 * 60 * 1000) },
        { id: 'old-unused', filename: 'old.png', mimeType: 'image/png', width: 100, height: 30, dataBase64: 'AAAA', createdAt: new Date(now - 48 * 60 * 60 * 1000) },
        { id: 'new-unused', filename: 'new.png', mimeType: 'image/png', width: 100, height: 30, dataBase64: 'AAAA', createdAt: new Date(now) },
      ])
      .mockResolvedValueOnce([
        { id: 'used', filename: 'used.svg', mimeType: 'image/svg+xml', width: 100, height: 30, dataBase64: 'AA==', createdAt: new Date(now - 48 * 60 * 60 * 1000) },
        { id: 'old-unused', filename: 'old.png', mimeType: 'image/png', width: 100, height: 30, dataBase64: 'AAAA', createdAt: new Date(now - 48 * 60 * 60 * 1000) },
        { id: 'new-unused', filename: 'new.png', mimeType: 'image/png', width: 100, height: 30, dataBase64: 'AAAA', createdAt: new Date(now) },
      ])
      .mockResolvedValueOnce([
        { id: 'used', filename: 'used.svg', mimeType: 'image/svg+xml', width: 100, height: 30, dataBase64: 'AA==', createdAt: new Date(now - 48 * 60 * 60 * 1000) },
        { id: 'new-unused', filename: 'new.png', mimeType: 'image/png', width: 100, height: 30, dataBase64: 'AAAA', createdAt: new Date(now) },
      ]);
    mockPrisma.brandAsset.deleteMany.mockResolvedValue({ count: 1 });

    const check = await request(app).get('/api/admin/brand/assets/storage-check').expect(200);
    expect(check.body.check).toMatchObject({
      totalCount: 3, referencedCount: 1, unusedCount: 2,
      protectedRecentCount: 1, eligibleUnusedCount: 1,
    });

    const cleanup = await request(app).delete('/api/admin/brand/assets/unused').expect(200);
    expect(cleanup.body.cleanup).toMatchObject({ deletedCount: 1, protectedRecentCount: 1 });
    expect(mockPrisma.brandAsset.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['old-unused'] } } });
    expect(mockPrisma.adminAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'BRAND_ASSETS_CLEANED' }),
    }));
  });
});
