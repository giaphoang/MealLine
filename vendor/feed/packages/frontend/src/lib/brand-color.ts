// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import type { Oklch } from '@/contexts/BrandContext';

export type Rgb = { r: number; g: number; b: number };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const srgbToLinear = (channel: number) => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};
const linearToSrgb = (channel: number) => {
  const value = clamp01(channel);
  const converted = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.round(clamp01(converted) * 255);
};

/** Client mirror of the server conversion used only for editable wizard input. */
export const rgbToOklch = ({ r, g, b }: Rgb): Oklch => {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const lCube = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const mCube = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const sCube = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const l = 0.2104542553 * lCube + 0.793617785 * mCube - 0.0040720468 * sCube;
  const a = 1.9779984951 * lCube - 2.428592205 * mCube + 0.4505937099 * sCube;
  const bValue = 0.0259040371 * lCube + 0.7827717662 * mCube - 0.808675766 * sCube;
  let h = Math.atan2(bValue, a) * 180 / Math.PI;
  if (h < 0) h += 360;
  return { l, c: Math.hypot(a, bValue), h };
};

export const oklchToRgb = ({ l, c, h }: Oklch): Rgb => {
  const radians = h * Math.PI / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);
  const lCube = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mCube = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sCube = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return {
    r: linearToSrgb(4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube),
    g: linearToSrgb(-1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube),
    b: linearToSrgb(-0.0041960863 * lCube - 0.7034186147 * mCube + 1.707614701 * sCube),
  };
};

export const hexToOklch = (hex: string): Oklch | null => {
  const match = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!match) return null;
  return rgbToOklch({
    r: Number.parseInt(match[1].slice(0, 2), 16),
    g: Number.parseInt(match[1].slice(2, 4), 16),
    b: Number.parseInt(match[1].slice(4, 6), 16),
  });
};

export const oklchToHex = (color: Oklch): string => {
  const { r, g, b } = oklchToRgb(color);
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
};

