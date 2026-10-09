// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import type { Oklch } from '@/contexts/BrandContext';
import { rgbToOklch } from '@/lib/brand-color';

type Pixel = [number, number, number];
export type ExtractedPaletteEntry = { color: Oklch; population: number };

const medianCut = (pixels: Pixel[], depth: number): { color: Pixel; count: number }[] => {
  if (!pixels.length) return [];
  if (depth === 0 || pixels.length < 2) {
    const total = pixels.reduce((sum, pixel) => [sum[0] + pixel[0], sum[1] + pixel[1], sum[2] + pixel[2]] as Pixel, [0, 0, 0]);
    return [{ color: total.map((channel) => Math.round(channel / pixels.length)) as Pixel, count: pixels.length }];
  }
  const ranges = [0, 1, 2].map((channel) => {
    const values = pixels.map((pixel) => pixel[channel]);
    return Math.max(...values) - Math.min(...values);
  });
  const channel = ranges.indexOf(Math.max(...ranges)) as 0 | 1 | 2;
  const sorted = [...pixels].sort((a, b) => a[channel] - b[channel]);
  const middle = Math.floor(sorted.length / 2);
  return [...medianCut(sorted.slice(0, middle), depth - 1), ...medianCut(sorted.slice(middle), depth - 1)];
};

const similar = (a: Oklch, b: Oklch) => {
  const hue = Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h));
  return Math.abs(a.l - b.l) < 0.1 && Math.abs(a.c - b.c) < 0.05 && (a.c < 0.04 || b.c < 0.04 || hue < 14);
};

export const extractPaletteFromImage = (src: string): Promise<ExtractedPaletteEntry[]> => new Promise((resolve) => {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 96 / image.naturalWidth, 96 / image.naturalHeight);
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return resolve([]);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const pixels: Pixel[] = [];
      for (let index = 0; index < data.length; index += 4) {
        if (data[index + 3] >= 200) pixels.push([data[index], data[index + 1], data[index + 2]]);
      }
      const ranked = medianCut(pixels, 4)
        .map((box) => {
          const color = rgbToOklch({ r: box.color[0], g: box.color[1], b: box.color[2] });
          // Population supplies stability; chroma supplies identity salience.
          // A large white logo plate should not outrank a smaller saturated
          // mark merely because it owns more pixels.
          const chromaSalience = 0.08 + Math.min(1, color.c / 0.12) * 0.92;
          return { ...box, color, score: box.count * chromaSalience };
        })
        .sort((a, b) => b.score - a.score);
      const palette: ExtractedPaletteEntry[] = [];
      for (const box of ranked) {
        const color = box.color;
        const existing = palette.find((entry) => similar(entry.color, color));
        if (existing) existing.population += box.count;
        else palette.push({ color, population: box.count });
        if (palette.length >= 6) break;
      }
      resolve(palette);
    } catch { resolve([]); }
  };
  image.onerror = () => resolve([]);
  image.src = src;
});
