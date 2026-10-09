// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { prepareBrandAsset } from '../brand-assets';

vi.mock('../../lib/prisma', () => ({ prisma: {} }));

/**
 * A vector's rasterisation cost must follow the size being produced, not the
 * coordinate system it was drawn in.
 *
 * `density` is DPI relative to the SVG's own viewBox, so the fixed 300 this
 * used to pass scaled every artboard by 4.17×. A 5120px viewBox — what
 * Illustrator exports by default — became 455 million pixels against sharp's
 * 40 million limit and threw before any resize could shrink it, so no SVG app
 * mark above ~1518px could be uploaded at all.
 */
const svgWithViewBox = (n: number) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}">` +
      `<rect width="${n}" height="${n}" fill="#37a27a"/></svg>`
  );

// Mirrors storeSquareBrandDerivative's pipeline without the database write.
const rasterise = async (svg: Buffer, size: number) => {
  const prepared = await prepareBrandAsset(svg);
  const intrinsic = Math.max(prepared.width, prepared.height);
  const density = Math.min(2400, Math.max(0.01, (72 * size * 2) / intrinsic));
  return sharp(prepared.data, { density, failOn: 'error', limitInputPixels: 40_000_000 })
    .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer({ resolveWithObject: true });
};

describe('vector app mark derivatives', () => {
  it('renders a large artboard that a fixed 300 DPI could not', async () => {
    // 5120 is the St Johns app mark, and the case that reported the failure.
    for (const size of [64, 192, 512]) {
      const out = await rasterise(svgWithViewBox(5120), size);
      expect(out.info.width, `${size}px derivative`).toBe(size);
      expect(out.info.height).toBe(size);
    }
  });

  it('proves the old fixed density really did exceed the limit', async () => {
    const prepared = await prepareBrandAsset(svgWithViewBox(5120));
    await expect(
      sharp(prepared.data, { density: 300, failOn: 'error', limitInputPixels: 40_000_000 })
        .resize(512, 512)
        .png()
        .toBuffer()
    ).rejects.toThrow(/pixel limit/i);
  });

  it('still renders small artboards sharply rather than upscaling a tiny raster', async () => {
    // A 24px icon must not be rendered at 24px and blown up to 512.
    const out = await rasterise(svgWithViewBox(24), 512);
    expect(out.info.width).toBe(512);
    const stats = await sharp(out.data).stats();
    // The fill is a solid brand green; a blurry upscale would not hold it flat.
    expect(stats.channels[1].max).toBeGreaterThan(stats.channels[0].max);
  });

  it('keeps every artboard size under the sharp pixel limit', async () => {
    for (const n of [16, 512, 5120, 20000]) {
      const prepared = await prepareBrandAsset(svgWithViewBox(n));
      const intrinsic = Math.max(prepared.width, prepared.height);
      const density = Math.min(2400, Math.max(0.01, (72 * 512 * 2) / intrinsic));
      const rendered = (intrinsic * density) / 72;
      expect(rendered * rendered, `viewBox ${n}`).toBeLessThan(40_000_000);
    }
  });
});
