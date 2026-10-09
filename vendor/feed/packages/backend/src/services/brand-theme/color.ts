// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Colour space conversions and contrast maths for brand derivation.
 *
 * Everything here is pure and dependency-free. Perceptual comparisons happen in
 * OKLab, where plain Euclidean distance is meaningful. HSL conversion remains
 * for legacy artifact compatibility and migration-fidelity tests; the active
 * v1.7.5 app boundary emits complete OKLCH values.
 */

/** Lightness 0..1, chroma 0..~0.37, hue in degrees. */
export type Oklch = { l: number; c: number; h: number };

/** Channels 0..255. */
export type Rgb = { r: number; g: number; b: number };

/** Hue 0..360, saturation and lightness as percentages. */
export type Hsl = { h: number; s: number; l: number };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const srgbToLinear = (channel: number) => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const linearToSrgb = (channel: number) => {
  const c = clamp01(channel);
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(clamp01(v) * 255);
};

export const rgbToOklch = ({ r, g, b }: Rgb): Oklch => {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const l_ = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m_ = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s_ = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  const l = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  let h = (Math.atan2(bb, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l, c: Math.hypot(a, bb), h };
};

export const oklchToRgb = ({ l, c, h }: Oklch): Rgb => {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);

  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return {
    r: linearToSrgb(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    g: linearToSrgb(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    b: linearToSrgb(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
  };
};

export const hexToRgb = (hex: string): Rgb => {
  const value = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error(`Expected a six-digit hex colour, received "${hex}".`);
  }
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
};

export const rgbToHex = ({ r, g, b }: Rgb): string =>
  `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;

export const hexToOklch = (hex: string): Oklch => rgbToOklch(hexToRgb(hex));
export const oklchToHex = (color: Oklch): string => rgbToHex(oklchToRgb(color));

export const rgbToHsl = ({ r, g, b }: Rgb): Hsl => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) return { h: 0, s: 0, l: l * 100 };

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / delta) % 6;
  else if (max === gn) h = (bn - rn) / delta + 2;
  else h = (rn - gn) / delta + 4;
  h *= 60;
  if (h < 0) h += 360;

  return { h, s: s * 100, l: l * 100 };
};

export const oklchToHsl = (color: Oklch): Hsl => rgbToHsl(oklchToRgb(color));

export const hslToRgb = ({ h, s, l }: Hsl): Rgb => {
  const sn = s / 100;
  const ln = l / 100;
  const chroma = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = chroma * (1 - Math.abs((hp % 2) - 1));
  const m = ln - chroma / 2;

  const [r, g, b] = (
    [
      [chroma, x, 0],
      [x, chroma, 0],
      [0, chroma, x],
      [0, x, chroma],
      [x, 0, chroma],
      [chroma, 0, x],
    ] as const
  )[Math.floor(hp) % 6];

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
};

export const hslToOklch = (hsl: Hsl): Oklch => rgbToOklch(hslToRgb(hsl));

/**
 * Parse a bare `H S% L%` triplet as `index.css` authors them. Returns null for
 * anything else, including the `var(--other-token)` aliases the file also uses.
 */
export const parseHslTriplet = (value: string): Hsl | null => {
  const match = value
    .trim()
    .match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!match) return null;
  return { h: Number(match[1]), s: Number(match[2]), l: Number(match[3]) };
};

/**
 * Perceptual distance between two OKLCH colours, as plain Euclidean distance in
 * OKLab. Used for snapping brand colours onto the Tailwind palette — the values
 * that matter are relative, so no ΔE refinement is warranted.
 */
export const perceptualDistance = (
  a: Oklch,
  b: Oklch,
  /**
   * Multiplier on the two chromatic axes. At 1 this is plain OKLab distance,
   * which is what accent snapping wants. Neutral snapping raises it — see
   * `CHROMA_WEIGHT` in `snap.ts` for why an unweighted comparison puts a
   * dead-neutral charcoal on a tinted family.
   */
  chromaWeight = 1
): number => {
  const toLab = ({ l, c, h }: Oklch) => {
    const rad = (h * Math.PI) / 180;
    return [l, c * Math.cos(rad), c * Math.sin(rad)] as const;
  };
  const [al, aa, ab] = toLab(a);
  const [bl, ba, bb] = toLab(b);
  return Math.hypot(al - bl, chromaWeight * (aa - ba), chromaWeight * (ab - bb));
};

/** Smallest signed angle between two hues, in degrees (-180..180]. */
export const hueDifference = (a: number, b: number): number =>
  ((((b - a) % 360) + 540) % 360) - 180;

const relativeLuminance = ({ r, g, b }: Rgb): number =>
  0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);

/** WCAG 2.1 contrast ratio, 1..21. */
export const contrastRatio = (a: Rgb, b: Rgb): number => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/**
 * The grey of identical relative luminance.
 *
 * Used to render a report in black and white on purpose rather than leaving it
 * to whatever a printer does. Because it preserves luminance exactly, every
 * contrast ratio in the document survives the conversion unchanged — brand
 * headings that cleared 7:1 in colour clear 7:1 in grey — so a greyscale
 * rendering needs no separate contrast proof. What it cannot preserve is
 * distinction between two colours that differ only in hue, which is precisely
 * why a chart palette has to be replaced rather than converted.
 */
export const greyscaleOf = (hex: string): string => {
  const channel = linearToSrgb(relativeLuminance(hexToRgb(hex)));
  return rgbToHex({ r: channel, g: channel, b: channel });
};

export const contrastRatioHex = (a: string, b: string): number =>
  contrastRatio(hexToRgb(a), hexToRgb(b));
