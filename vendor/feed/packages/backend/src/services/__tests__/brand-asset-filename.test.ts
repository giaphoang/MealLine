// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { describe, expect, it, vi, beforeEach } from 'vitest';

const created: Array<Record<string, unknown>> = [];
vi.mock('../../db', () => ({
  default: { brandAsset: { create: vi.fn(async ({ data }: never) => { created.push(data); return data; }) } },
}));

import { prepareBrandAsset, storeBrandAsset } from '../brand-assets';

/**
 * The wizard's file input is cleared the instant a file is handed over, so
 * that re-picking the same file still fires `change`. It therefore always
 * reads "No file chosen", and the only way to show what is in a slot is to
 * carry the stored name back on the reference.
 */
const svg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64"/></svg>'
);

describe('stored brand asset references', () => {
  beforeEach(() => { created.length = 0; });

  it('carries the filename back to the caller, not just into the row', async () => {
    const prepared = await prepareBrandAsset(svg);
    const reference = await storeBrandAsset(prepared, 'stjohns-dark.svg');
    expect(reference.filename).toBe('stjohns-dark.svg');
    expect(created[0].filename).toBe('stjohns-dark.svg');
  });

  it('returns the same sanitised name that was written, never the raw input', async () => {
    const prepared = await prepareBrandAsset(svg);
    // Anything outside [A-Za-z0-9._-] is collapsed, so a name with spaces or a
    // traversal attempt must not come back looking like the original.
    const reference = await storeBrandAsset(prepared, '../../St Johns Logo (final).svg');
    expect(reference.filename).toBe(created[0].filename);
    expect(reference.filename).not.toContain('/');
    expect(reference.filename).not.toContain(' ');
    expect(reference.filename).toMatch(/\.svg$/);
  });
});
