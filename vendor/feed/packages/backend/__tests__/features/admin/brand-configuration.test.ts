// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  brandConfiguration: { findFirst: vi.fn() },
  brandAsset: { findUnique: vi.fn() },
}));

vi.mock('../../../src/db', () => ({ default: mockPrisma }));

import brandRouter from '../../../src/routes/brand';
import {
  previewBrandConfiguration,
  publicBrandPayload,
} from '../../../src/services/brand-config';
import { WTH_BRAND_CONFIG } from '../../../src/services/brand-config/presets';
import { parseBrandConfig } from '../../../src/services/brand-config/config-schema';

/**
 * A second brand, invented here rather than shipped.
 *
 * These cases prove that derivation and preview work for a brand that is not
 * the compiled default — the point of a white-label product. They used to
 * borrow a bundled St. Johns Food Share template for that, which made a real
 * agency's identity load-bearing for the test suite and meant retiring the
 * template broke unrelated proofs. A fixture that names nobody is the right
 * shape: what matters is that the configuration differs from WTH, not whose it
 * is.
 */
const OTHER_BRAND_CONFIG = {
  ...WTH_BRAND_CONFIG,
  identity: {
    ...WTH_BRAND_CONFIG.identity,
    organizationName: 'Example Food Pantry',
    appName: 'FEED',
    organizationWebsite: 'https://example.org/',
  },
  logo: {
    ...WTH_BRAND_CONFIG.logo,
    light: { kind: 'builtin' as const, src: '/brand/placeholder-mark.svg', width: 640, height: 220 },
    dark: { kind: 'builtin' as const, src: '/brand/placeholder-mark.svg', width: 640, height: 220 },
  },
  colors: {
    accent: { l: 0.55, c: 0.12, h: 163 },
    neutral: { l: 0.3, c: 0.01, h: 90 },
    hierarchy: [
      { l: 0.55, c: 0.12, h: 163 },
      { l: 0.3, c: 0.01, h: 90 },
      { l: 0.95, c: 0.01, h: 90 },
    ],
  },
};

describe('organization brand configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.brandConfiguration.findFirst.mockResolvedValue(null);
  });

  it('accepts both the shipped default and a brand that is not it', () => {
    expect(parseBrandConfig(WTH_BRAND_CONFIG).ok).toBe(true);
    expect(parseBrandConfig(OTHER_BRAND_CONFIG).ok).toBe(true);
    expect(OTHER_BRAND_CONFIG.logo.light).not.toEqual(WTH_BRAND_CONFIG.logo.light);
    expect(OTHER_BRAND_CONFIG.identity.organizationName).not.toBe(
      WTH_BRAND_CONFIG.identity.organizationName
    );
  });

  it('derives both scopes, unique family alternates, and chart colors without persisting tokens', () => {
    const preview = previewBrandConfiguration(OTHER_BRAND_CONFIG);
    expect(Object.keys(preview.tokens.light).length).toBeGreaterThan(20);
    expect(Object.keys(preview.tokens.dark)).toEqual(Object.keys(preview.tokens.light));
    expect(new Set(preview.alternates.map((item) => item.family)).size).toBe(3);
    expect(preview.chartColors.light).toHaveLength(5);
    expect(OTHER_BRAND_CONFIG).not.toHaveProperty('tokens');
  });

  it('fails closed to the compiled identity when the active row is invalid', async () => {
    mockPrisma.brandConfiguration.findFirst.mockResolvedValue({
      id: 'broken', payload: { schemaVersion: 999 }, isActive: true,
    });
    const brand = await publicBrandPayload();
    expect(brand.source).toBe('compiled-default');
    expect(brand.identity.organizationName).toBe('MealLine');
    // ASK, not a word match: say what happened, name the remedy, and never
    // expose the raw validator or Prisma text (which carries absolute server
    // paths and a source excerpt).
    expect(brand.warning).toMatch(/could not be applied/i);
    expect(brand.warning).toMatch(/built-in look/i);
    expect(brand.warning).not.toMatch(/prisma|invocation|schemaVersion|\/Users\//i);
  });

  it('delivers a cache-revalidated stylesheet before authentication', async () => {
    const app = express();
    app.use('/api/brand', brandRouter);
    const first = await request(app).get('/api/brand/theme.css').expect(200);
    expect(first.headers['content-type']).toMatch(/text\/css/);
    // The compiled MealLine appearance uses the same theme generator as a
    // saved appearance, and remains available before staff sign in.
    expect(first.text).toMatch(/--primary:/);
    const second = await request(app)
      .get('/api/brand/theme.css')
      .set('If-None-Match', first.headers.etag)
      .expect(304);
    expect(second.text).toBe('');
  });

  it('never offers protected counting nouns as configurable terminology', () => {
    const keys = Object.keys(WTH_BRAND_CONFIG.terminology ?? {});
    expect(keys).not.toEqual(expect.arrayContaining(['household', 'visit', 'personServed']));
  });
});
