// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Shared chart primitives for print.
 *
 * Every card draws with these; a card itself contributes only a `series()` and
 * a one-line `print()` (see `analytics-cards.ts`). Keeping the drawing here is
 * what makes the marginal cost of an exportable card a handful of lines.
 *
 * Deliberately free of CSS: colours and type are attributes on the elements, so
 * the output is identical wherever it is rendered. There is no stylesheet to
 * resolve, which is the property the serialized-SVG approach had to reconstruct
 * by inlining computed styles.
 */

import type { Series } from './condense';

import { PRINT_GREYSCALE_STROKES } from '../brand-theme/charts';
import { contrastRatioHex } from '../brand-theme/color';
import { boundaryRingsFor, placesFor } from './basemap';
import { currentReportPrintTheme } from './print-theme';

const palette = () => currentReportPrintTheme().palette;
const ink = () => currentReportPrintTheme().ink;
const muted = () => currentReportPrintTheme().muted;
const grid = () => currentReportPrintTheme().grid;

/* ---------- series texture ----------
 *
 * Solid greys first, texture only once they run out.
 *
 * The greyscale ramp is six steps — the light end is capped by WCAG 1.4.11's
 * 3:1 and the dark end by the ink, and six is what fits between them at a
 * spacing a photocopier still resolves. Past that it used to wrap, so the
 * twelve series on `procurement-legacy-donations-over-time` printed as a set of
 * greys and a set of exact duplicates.
 *
 * The textures vary by **structure**, not by angle. A first pass used a hatch
 * and a cross-hatch, which is one family at two densities: they read as "more
 * hatched" and "less hatched", which is a magnitude, and magnitude is the one
 * thing a categorical series must not imply. Dots, rules, diagonals, a grid and
 * a checker are different *kinds* of mark, and are told apart at a glance and
 * at a distance in a way that two hatch angles are not.
 *
 * They are also drawn to roughly equal coverage, for the same reason. A dense
 * texture next to a sparse one reads as heavier, inventing a ranking among
 * categories that have none.
 *
 * The lines are cut in the paper colour rather than drawn in a darker grey, so
 * a textured series reads slightly lighter than the solid one it shares a step
 * with — separation from two directions instead of one.
 */

/** Tile side, in user units. Small enough to read inside a 2-unit bar. */
const TEXTURE_TILE = 4;

/**
 * Index 0 is solid — no pattern element, the grey is used directly.
 *
 * The rest are hand-written because the alternative was worse, not because no
 * library exists. `textures` and `svg-patterns` both carry a good catalogue,
 * and both write into a d3 selection or a virtual-dom tree; this renderer
 * builds SVG as strings in a process with no DOM, deliberately, so either one
 * costs a DOM shim in the report path to deliver what is ultimately a dozen
 * `<path d>` values. Both were last published in 2022 and `svg-patterns` pulls
 * `virtual-dom`, unmaintained since 2016. Taking the geometry and leaving the
 * rendering layer is the smaller and more durable dependency.
 */
const TEXTURES: readonly ((paper: string) => string)[] = [
  () => '',
  // Rules: horizontal.
  paper => `<path d="M0,1 h4 M0,3 h4" stroke="${paper}" stroke-width="1" fill="none"/>`,
  // Diagonal, one way.
  paper => `<path d="M-1,1 l2,-2 M0,4 l4,-4 M3,5 l2,-2" stroke="${paper}" stroke-width="1.1" fill="none"/>`,
  // Dots: paper punched out of the grey.
  paper => `<circle cx="1" cy="1" r="0.85" fill="${paper}"/><circle cx="3" cy="3" r="0.85" fill="${paper}"/>`,
  // Rules: vertical.
  paper => `<path d="M1,0 v4 M3,0 v4" stroke="${paper}" stroke-width="1" fill="none"/>`,
  // Diagonal, the other way.
  paper => `<path d="M-1,3 l2,2 M0,0 l4,4 M3,-1 l2,2" stroke="${paper}" stroke-width="1.1" fill="none"/>`,
  // Grid.
  paper => `<path d="M0,2 h4 M2,0 v4" stroke="${paper}" stroke-width="0.9" fill="none"/>`,
  // Checker.
  paper => `<path d="M0,0 h2 v2 h-2 z M2,2 h2 v2 h-2 z" fill="${paper}"/>`,
];

/** Which grey and which texture series `si` gets. */
const textureIndexFor = (si: number) => {
  const steps = palette().length;
  return {
    grey: palette()[si % steps],
    texture: currentReportPrintTheme().seriesPatterns
      ? Math.floor(si / steps) % TEXTURES.length
      : 0,
  };
};

/**
 * Deterministic, and deliberately so.
 *
 * A page holds many card SVGs inline and each carries its own `<defs>`, so two
 * charts that both reach series seven emit the same id twice. A counter would
 * avoid the duplicate but make the output differ run to run; instead the id is
 * a pure function of what it defines, so a collision resolves to an identical
 * pattern and renders correctly either way.
 */
const textureId = (texture: number, grey: string) =>
  `feed-tx-${texture}-${grey.replace('#', '')}`;

/**
 * Text colour for a label sitting *on* series `si`.
 *
 * Ink or paper, whichever the fill carries better. Measured against the solid
 * grey behind a texture rather than the texture itself: a patterned fill is
 * part grey and part paper, so its effective luminance is somewhere between,
 * and choosing against the grey is the conservative end of that range.
 */
export function seriesLabelInk(si: number): string {
  const theme = currentReportPrintTheme();
  const behind = textureIndexFor(si).grey;
  return contrastRatioHex(theme.background, behind) >= contrastRatioHex(theme.ink, behind)
    ? theme.background
    : theme.ink;
}

/** Fill for series `si`: a grey, or a reference to a textured version of it. */
export function seriesFill(si: number): string {
  const { grey, texture } = textureIndexFor(si);
  return texture === 0 ? grey : `url(#${textureId(texture, grey)})`;
}

/**
 * The `<defs>` a chart of `count` series needs. Empty while the greys hold.
 *
 * Every SVG that draws series must include this, the legend included — a
 * legend swatch that does not carry the same texture as its bars is worse than
 * no legend, because it asserts a match that is not there.
 */
export function seriesDefs(count: number): string {
  const paper = currentReportPrintTheme().background;
  const seen = new Map<string, string>();
  for (let si = 0; si < count; si += 1) {
    const { grey, texture } = textureIndexFor(si);
    if (texture === 0) continue;
    const id = textureId(texture, grey);
    if (seen.has(id)) continue;
    seen.set(
      id,
      `<pattern id="${id}" width="${TEXTURE_TILE}" height="${TEXTURE_TILE}" patternUnits="userSpaceOnUse">` +
        `<rect width="${TEXTURE_TILE}" height="${TEXTURE_TILE}" fill="${grey}"/>` +
        TEXTURES[texture](paper) +
        `</pattern>`
    );
  }
  return seen.size === 0 ? '' : `<defs>${[...seen.values()].join('')}</defs>`;
}

/* ---------- series lines ----------
 *
 * A line is not a small bar, and treating it as one is what made every line
 * card in the export hard to read.
 *
 * A filled bar is a slab of grey a centimetre across, where six levels separate
 * cleanly. A series line is a two-unit stroke crossing other strokes over a
 * gridded plot, and there it is about three. Handing a five-series line chart
 * five fill greys gave it two pairs a reader cannot separate, and no amount of
 * reordering fixes that, because the ramp was the wrong ramp.
 *
 * So lines take a three-level ramp and get the rest of their separation from
 * dashing — the channel a stroke has and an area does not, and the oldest
 * convention in printed technical drawing. Three greys against four dash
 * styles is twelve distinguishable lines, which covers the longest line card
 * in the report.
 *
 * Lighter greys are drawn slightly heavier so the levels carry equal visual
 * weight; a 2-unit stroke at 3:1 and a 2-unit stroke at 18:1 do not.
 */

const STROKE_DASHES: readonly string[] = ['', '6 3', '1.5 2.5', '7 2.5 1.5 2.5'];

export interface SeriesLineStyle {
  stroke: string;
  /** Ready to interpolate into an element, `` ` `` included, or empty. */
  dash: string;
  width: number;
}

export function seriesLineStyle(si: number): SeriesLineStyle {
  const theme = currentReportPrintTheme();
  if (!theme.seriesPatterns) {
    return { stroke: palette()[si % palette().length], dash: '', width: 2 };
  }
  const levels = PRINT_GREYSCALE_STROKES;
  const level = si % levels.length;
  const dash = STROKE_DASHES[Math.floor(si / levels.length) % STROKE_DASHES.length];
  return {
    stroke: levels[level],
    dash: dash ? ` stroke-dasharray="${dash}"` : '',
    width: [2, 2.2, 2.5][level] ?? 2,
  };
}

const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const escAttribute = (s: string) => esc(s).replace(/"/g, '&quot;');
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

// ---------- label fitting ----------

/**
 * Helvetica advance widths, in 1/1000 em, for ASCII 32–126.
 *
 * Real metrics rather than an average character width. "Meat, Chicken
 * Drumsticks (12/3.4 lb trays)" and "MMMMMMMMMMMMMMMMMMMMMMMMMMMMM" are the
 * same length and nowhere near the same width, so an average truncates one far
 * too early and lets the other run straight under the bars — which is the bug
 * this exists to fix. Arial was drawn to these same widths, so one table is
 * correct for both families in the SVG's font stack.
 */
const HELVETICA_WIDTHS: readonly number[] = [
  //  ␣    !    "    #    $    %    &    '
  278, 278, 355, 556, 556, 889, 667, 191,
  //  (    )    *    +    ,    -    .    /
  333, 333, 389, 584, 278, 333, 278, 278,
  //  0    1    2    3    4    5    6    7
  556, 556, 556, 556, 556, 556, 556, 556,
  //  8    9    :    ;    <    =    >    ?
  556, 556, 278, 278, 584, 584, 584, 556,
  //  @    A    B    C    D    E    F    G
  1015, 667, 667, 722, 722, 667, 611, 778,
  //  H    I    J    K    L    M    N    O
  722, 278, 500, 667, 556, 833, 722, 778,
  //  P    Q    R    S    T    U    V    W
  667, 778, 722, 667, 611, 722, 667, 944,
  //  X    Y    Z    [    \    ]    ^    _
  667, 667, 611, 278, 278, 278, 469, 556,
  //  `    a    b    c    d    e    f    g
  333, 556, 556, 500, 556, 556, 278, 556,
  //  h    i    j    k    l    m    n    o
  556, 222, 222, 500, 222, 833, 556, 556,
  //  p    q    r    s    t    u    v    w
  556, 556, 333, 500, 278, 556, 500, 722,
  //  x    y    z    {    |    }    ~
  500, 500, 500, 334, 260, 334, 584,
];

const ELLIPSIS = '…';
/** Helvetica's own ellipsis advance; it is not in the ASCII table above. */
const ELLIPSIS_UNITS = 1000;
const FALLBACK_UNITS = 556;

const charUnits = (char: string): number => {
  if (char === ELLIPSIS) return ELLIPSIS_UNITS;
  const code = char.codePointAt(0) ?? 0;
  return code >= 32 && code <= 126 ? HELVETICA_WIDTHS[code - 32] : FALLBACK_UNITS;
};

/** Rendered width of `text` in px at `fontSize`. */
export function textWidth(text: string, fontSize: number): number {
  let units = 0;
  for (const char of text) units += charUnits(char);
  return (units / 1000) * fontSize;
}

/**
 * Shortens a label to fit `maxWidth`, ending in an ellipsis when it had to cut.
 *
 * Label columns are a fixed width and the bars start at their right edge, so an
 * over-long label used to print straight through the bar beside it. Cutting is
 * the lesser loss: the CSV beside the PDF carries every name in full, so
 * nothing is actually lost — only the picture is abbreviated, and the ellipsis
 * says so without a legend.
 */
export function truncateToWidth(text: string, maxWidth: number, fontSize: number): string {
  if (maxWidth <= 0) return '';
  if (textWidth(text, fontSize) <= maxWidth) return text;

  const budget = maxWidth - textWidth(ELLIPSIS, fontSize);
  if (budget <= 0) return ELLIPSIS;

  const chars = [...text];
  let width = 0;
  let kept = 0;
  for (const char of chars) {
    const next = width + textWidth(char, fontSize);
    if (next > budget) break;
    width = next;
    kept += 1;
  }
  // A trailing space before the ellipsis reads as a gap, not a cut.
  return `${chars.slice(0, kept).join('').trimEnd()}${ELLIPSIS}`;
}

// ---------- shared primitives ----------

/**
 * How a bar's value is written beside it.
 *
 * Pounds are the common case and stay the default, but the unit was hard-coded
 * here and two cards were quietly wrong on paper as a result: "Where Paid
 * Procurement Dollars Went" printed `43,245 lb` for $43,245 of spend, and
 * Availability Summary printed `58 lb` for a count of items. A caller passes
 * its own formatter now, because only the card knows what it is measuring.
 */
export type BarValueFormat = (value: number) => string;

export const POUNDS: BarValueFormat = v => `${fmt(v)} lb`;
export const COUNT: BarValueFormat = v => fmt(v);
export const PERCENT: BarValueFormat = v => `${v.toFixed(1)}%`;
/** Matches the screen's `dollars()`: currency style, en-US. */
export const DOLLARS: BarValueFormat = v =>
  v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/** Horizontal bars with a label column. Used for any "mix" breakdown. */
export function hBarSvg(
  rows: {
    label: string;
    value: number;
    /** Optional adjacent pieces of this row's total, drawn as one stacked bar. */
    segments?: { name: string; value: number }[];
  }[],
  width = 900,
  rowH = 30,
  formatValue: BarValueFormat = POUNDS,
  segmentNames: string[] = []
): string {
  const labelW = 220, pad = 12, chartW = width - labelW - pad - 90;
  // The bars begin at `labelW`, so a label may occupy everything up to it less
  // a small gutter. Anything longer is cut rather than drawn over the bar.
  const labelMaxW = labelW - 10;
  const max = Math.max(1, ...rows.map(r => r.value));
  // Segments are decoded from a legend, so they take texture past the seventh.
  // A plain row bar carries its own label, which makes its fill decorative — it
  // cycles the greys and stays flat, because texturing a bar that is already
  // named adds noise and says nothing.
  const segmentFill = new Map(segmentNames.map((name, index) => [name, seriesFill(index)]));
  const height = rows.length * rowH + pad * 2;
  const bars = rows.map((r, i) => {
    const y = pad + i * rowH;
    const w = Math.max(1, (r.value / max) * chartW);
    const usableSegments = r.segments?.filter(segment => segment.value > 0) ?? [];
    let segmentX = labelW;
    const rects = usableSegments.length > 0
      ? usableSegments.map((segment, segmentIndex) => {
          const segmentW = r.value > 0 ? (segment.value / r.value) * w : 0;
          const rect = `<rect data-segment="${escAttribute(segment.name)}" x="${segmentX}" y="${y + 5}" width="${segmentW}" height="${rowH - 14}" fill="${segmentFill.get(segment.name) ?? seriesFill(segmentIndex)}"/>`;
          segmentX += segmentW;
          return rect;
        }).join('')
      : `<rect x="${labelW}" y="${y + 5}" width="${w}" height="${rowH - 14}" rx="2" fill="${palette()[i % palette().length]}"/>`;
    return `<text x="0" y="${y + rowH / 2 + 4}" font-size="12" fill="${ink()}">${esc(truncateToWidth(r.label, labelMaxW, 12))}</text>` +
      rects +
      `<text x="${labelW + w + 8}" y="${y + rowH / 2 + 4}" font-size="11" fill="${muted()}">${esc(formatValue(r.value))}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Helvetica, Arial, sans-serif">${seriesDefs(segmentNames.length)}${bars}</svg>`;
}

/** Stacked vertical bars over an ordered category axis. Used for time series. */
export function stackedBarSvg(
  categories: string[],
  series: { name: string; values: number[] }[],
  width = 900, height = 260
): string {
  const padL = 62, padR = 8, padT = 10, padB = 42;
  const plotW = width - padL - padR, plotH = height - padT - padB;
  const totals = categories.map((_, i) => series.reduce((s, x) => s + (x.values[i] || 0), 0));
  const max = Math.max(1, ...totals);
  const step = plotW / Math.max(1, categories.length);
  const barW = Math.max(2, step * 0.68);

  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const y = padT + plotH - f * plotH;
    return `<line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="${grid()}" stroke-width="1"/>` +
      `<text x="${padL - 8}" y="${y + 4}" font-size="10" fill="${muted()}" text-anchor="end">${fmt(Math.round(max * f))}</text>`;
  }).join('');

  const bars = categories.map((c, i) => {
    let acc = 0;
    const x = padL + i * step + (step - barW) / 2;
    const segs = series.map((s, si) => {
      const v = s.values[i] || 0;
      if (v <= 0) return '';
      const h = (v / max) * plotH;
      const y = padT + plotH - acc - h;
      acc += h;
      return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${seriesFill(si)}"/>`;
    }).join('');
    // Thin out labels so a long series stays readable on paper.
    const showLabel = categories.length <= 14 || i % Math.ceil(categories.length / 12) === 0;
    const label = showLabel
      ? `<text x="${x + barW / 2}" y="${height - padB + 16}" font-size="9" fill="${muted()}" text-anchor="middle" transform="rotate(-40 ${x + barW / 2} ${height - padB + 16})">${esc(c)}</text>`
      : '';
    return segs + label;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Helvetica, Arial, sans-serif">${seriesDefs(series.length)}${ticks}${bars}</svg>`;
}

/**
 * Legend drawn into the SVG, so it cannot be lost the way an HTML one is.
 *
 * `variant` must match the mark the legend is explaining. A line chart
 * separates its series by stroke level and dash; a filled chart separates them
 * by grey and texture, from a different and longer ramp. A swatch drawn from
 * the wrong one names the right series with the wrong appearance, which is
 * worse than no legend — it asserts a correspondence that is not there.
 */
export function legendSvg(
  names: string[],
  width = 900,
  variant: 'fill' | 'line' = 'fill'
): string {
  const items = names.map((n, i) => {
    const x = (i % 4) * (width / 4);
    const y = Math.floor(i / 4) * 18 + 12;
    const swatch = variant === 'line'
      ? (() => {
          const style = seriesLineStyle(i);
          return `<line x1="${x}" y1="${y - 3}" x2="${x + 12}" y2="${y - 3}" stroke="${style.stroke}"` +
            ` stroke-width="${style.width}" stroke-linecap="round"${style.dash}/>`;
        })()
      : `<rect x="${x}" y="${y - 8}" width="10" height="10" rx="2" fill="${seriesFill(i)}"/>`;
    return swatch +
      `<text x="${x + 17}" y="${y + 1}" font-size="11" fill="${ink()}">${esc(n)}</text>`;
  }).join('');
  const rows = Math.ceil(names.length / 4);
  const defs = variant === 'line' ? '' : seriesDefs(names.length);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${rows * 18 + 6}" font-family="Helvetica, Arial, sans-serif">${defs}${items}</svg>`;
}

/**
 * One polyline per series over a shared category axis.
 *
 * For comparisons where stacking would be a lie: a year-over-year seasonal
 * chart stacked would sum unrelated years into a total nobody asked for. The
 * screen draws these as lines, and so does the report.
 */
export function lineChartSvg(
  categories: string[],
  series: Series[],
  width = 900,
  height = 260,
  /**
   * Fills under the first series.
   *
   * Available Assortment Over Time draws its combined total as an area and each
   * category as a line, so the total reads as the envelope the categories sit
   * inside. Rendering all of them as bare lines would lose that hierarchy and
   * make the total look like just another category.
   */
  fillFirst = false,
  options: {
    /** Show the latest defined value beside every line. */
    endLabels?: boolean;
    formatValue?: BarValueFormat;
    /** Override the numeric axis, used when zero is not a meaningful baseline. */
    domain?: [number, number];
    /** Format Y-axis ticks independently from endpoint labels. */
    formatAxisValue?: BarValueFormat;
  } = {}
): string {
  const padL = 62, padR = options.endLabels ? 86 : 8, padT = 10, padB = 34;
  const plotW = width - padL - padR, plotH = height - padT - padB;
  const dataMax = Math.max(
    1,
    ...series.flatMap(s => s.values.filter((_, index) => s.defined?.[index] !== false))
  );
  const domainMin = options.domain?.[0] ?? 0;
  const domainMax = Math.max(domainMin + 1, options.domain?.[1] ?? dataMax);
  const step = categories.length > 1 ? plotW / (categories.length - 1) : 0;
  const x = (i: number) => padL + i * step;
  const y = (v: number) => padT + plotH - ((v - domainMin) / (domainMax - domainMin)) * plotH;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const ty = padT + plotH - f * plotH;
    const value = domainMin + (domainMax - domainMin) * f;
    return `<line x1="${padL}" y1="${ty}" x2="${width - padR}" y2="${ty}" stroke="${grid()}" stroke-width="1"/>` +
      `<text x="${padL - 8}" y="${ty + 4}" font-size="10" fill="${muted()}" text-anchor="end">${esc((options.formatAxisValue ?? COUNT)(value))}</text>`;
  }).join('');

  const lines = series.map((s, si) => {
    const { stroke, dash, width: strokeW } = seriesLineStyle(si);
    const runs: number[][] = [];
    s.values.forEach((_, index) => {
      if (s.defined?.[index] === false) return;
      const previous = runs[runs.length - 1];
      if (!previous || previous[previous.length - 1] !== index - 1) runs.push([index]);
      else previous.push(index);
    });

    return runs.map(run => {
      const points = run
        .map(index => `${x(index).toFixed(1)},${y(s.values[index]).toFixed(1)}`)
        .join(' ');
      const area =
        fillFirst && si === 0 && run.length > 1
          ? `<polygon points="${x(run[0]).toFixed(1)},${(padT + plotH).toFixed(1)} ${points} ${x(run[run.length - 1]).toFixed(1)},${(padT + plotH).toFixed(1)}" fill="${stroke}" fill-opacity="0.18"/>`
          : '';
      const mark = run.length === 1
        ? `<circle cx="${x(run[0]).toFixed(1)}" cy="${y(s.values[run[0]]).toFixed(1)}" r="2.5" fill="${stroke}"/>`
        : `<polyline points="${points}" fill="none" stroke="${stroke}" stroke-width="${strokeW}" stroke-linejoin="round" stroke-linecap="round"${dash}/>`;
      return area + mark;
    }).join('');
  }).join('');

  // A daily timeline cannot label every point; thin to roughly a dozen.
  const stride = Math.max(1, Math.ceil(categories.length / 12));
  const labels = categories.map((c, i) =>
    i % stride === 0
      ? `<text x="${x(i)}" y="${height - padB + 16}" font-size="10" fill="${muted()}" text-anchor="middle">${esc(c)}</text>`
      : ''
  ).join('');

  const endLabels = options.endLabels
    ? (() => {
        const candidates = series.flatMap((s, si) => {
          let index = s.values.length - 1;
          while (index >= 0 && s.defined?.[index] === false) index -= 1;
          return index >= 0
            ? [{ series: s, si, index, desiredY: y(s.values[index]) }]
            : [];
        }).sort((left, right) => left.desiredY - right.desiredY);
        const minGap = 12;
        const bottom = padT + plotH;
        const positions = candidates.map((candidate, index) => ({
          ...candidate,
          labelY: Math.max(candidate.desiredY, index === 0 ? padT : 0),
        }));
        for (let i = 1; i < positions.length; i += 1) {
          positions[i].labelY = Math.max(positions[i].desiredY, positions[i - 1].labelY + minGap);
        }
        if (positions.length > 0 && positions[positions.length - 1].labelY > bottom) {
          positions[positions.length - 1].labelY = bottom;
          for (let i = positions.length - 2; i >= 0; i -= 1) {
            positions[i].labelY = Math.min(positions[i].labelY, positions[i + 1].labelY - minGap);
          }
        }
        return positions.map(candidate => {
          const pointX = x(candidate.index);
          const pointY = candidate.desiredY;
          const color = seriesLineStyle(candidate.si).stroke;
          return `<line x1="${pointX.toFixed(1)}" y1="${pointY.toFixed(1)}" x2="${(pointX + 5).toFixed(1)}" y2="${candidate.labelY.toFixed(1)}" stroke="${color}" stroke-width="1"/>` +
            `<text data-end-label="${escAttribute(candidate.series.name)}" x="${(pointX + 8).toFixed(1)}" y="${(candidate.labelY + 4).toFixed(1)}" font-size="10" font-weight="700" fill="${color}">${esc((options.formatValue ?? COUNT)(candidate.series.values[candidate.index]))}</text>`;
        }).join('');
      })()
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Helvetica, Arial, sans-serif">${ticks}${lines}${labels}${endLabels}</svg>`;
}

/**
 * Horizontal bars split into stacked segments, with a label column.
 *
 * For a breakdown-within-a-breakdown: categories down the side, each bar
 * divided by a second dimension. Stacking is correct here — unlike the seasonal
 * chart, the segments are parts of one whole, so the bar length is a real
 * total.
 */
export function stackedHBarSvg(
  categories: string[],
  series: Series[],
  width = 900,
  rowH = 26,
  /**
   * The row total's units. Defaults to pounds, which is what the procurement
   * card that first needed this chart measures — but the shape is not about
   * weight, and a card counting households must not print "1,443 lb".
   */
  formatValue: BarValueFormat = POUNDS
): string {
  const labelW = 230, pad = 12, valueW = 96;
  const chartW = width - labelW - pad - valueW;
  const labelMaxW = labelW - 10;
  const totals = categories.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0));
  const max = Math.max(1, ...totals);
  const height = categories.length * rowH + pad * 2;

  const rows = categories.map((label, i) => {
    const y = pad + i * rowH;
    let x = labelW;
    const segments = series.map((s, si) => {
      const v = s.values[i] ?? 0;
      if (v <= 0) return '';
      const w = (v / max) * chartW;
      const rect = `<rect x="${x.toFixed(1)}" y="${y + 4}" width="${w.toFixed(1)}" height="${rowH - 12}" fill="${seriesFill(si)}"/>`;
      // The row total alone does not say how it split, and on screen that is
      // what the tooltip is for. Print has no hover, so each part is written
      // into its own segment when it fits — and simply left out when it does
      // not, rather than spilling over a neighbour it does not belong to.
      const text = formatValue(v);
      const label = textWidth(text, 9) + 8 <= w
        ? `<text x="${(x + w / 2).toFixed(1)}" y="${y + rowH / 2 + 3.5}" font-size="9"` +
          ` text-anchor="middle" fill="${seriesLabelInk(si)}">${esc(text)}</text>`
        : '';
      x += w;
      return rect + label;
    }).join('');
    return `<text x="0" y="${y + rowH / 2 + 4}" font-size="11" fill="${ink()}">${esc(truncateToWidth(label, labelMaxW, 11))}</text>` +
      segments +
      `<text x="${(x + 8).toFixed(1)}" y="${y + rowH / 2 + 4}" font-size="10" fill="${muted()}">${formatValue(totals[i])}</text>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Helvetica, Arial, sans-serif">${seriesDefs(series.length)}${rows}</svg>`;
}

/**
 * Horizontal bars grouped, not stacked: several independent measures per row.
 *
 * The distinction matters and is not cosmetic. `stackedHBarSvg` is for parts of
 * one whole, where bar length is a real total. These series are independent
 * signals — Category Pressure's own description says so — and stacking them
 * would produce a combined length that means nothing.
 */
export function groupedHBarSvg(
  categories: string[],
  series: Series[],
  width = 900,
  groupH = 13,
  options: {
    /** Fixed semantic maximum, such as 100 for percentages. */
    max?: number;
    showAxis?: boolean;
    formatValue?: BarValueFormat;
  } = {}
): string {
  const labelW = 150, pad = 12, valueW = options.formatValue ? 68 : 8;
  const chartW = width - labelW - pad - valueW;
  const labelMaxW = labelW - 10;
  const observedMax = Math.max(1, options.max ?? Math.max(1, ...series.flatMap(s => s.values)));
  const integerStep = options.showAxis && options.formatValue === COUNT
    ? Math.max(1, Math.ceil(observedMax / 4))
    : null;
  const max = integerStep === null
    ? observedMax
    : Math.ceil(observedMax / integerStep) * integerStep;
  const rowH = groupH * series.length + 8;
  const axisH = options.showAxis ? 24 : 0;
  const height = categories.length * rowH + pad * 2 + axisH;

  const rows = categories.map((label, i) => {
    const top = pad + i * rowH;
    const bars = series.map((s, si) => {
      if (s.defined?.[i] === false) return '';
      const v = s.values[i] ?? 0;
      const w = Math.max(0, (v / max) * chartW);
      const y = top + si * groupH;
      const value = options.formatValue
        ? `<text data-bar-value="${escAttribute(s.name)}" x="${(labelW + w + 5).toFixed(1)}" y="${y + groupH - 4}" font-size="10" fill="${muted()}">${esc(options.formatValue(v))}</text>`
        : '';
      return `<rect x="${labelW}" y="${y}" width="${w.toFixed(1)}" height="${groupH - 3}" rx="1.5" fill="${seriesFill(si)}"/>${value}`;
    }).join('');
    return `<text x="0" y="${top + (rowH - 8) / 2 + 4}" font-size="11" fill="${ink()}">${esc(truncateToWidth(label, labelMaxW, 11))}</text>${bars}`;
  }).join('');

  const axisY = pad + categories.length * rowH;
  const axisValues = integerStep === null
    ? [0, max * 0.25, max * 0.5, max * 0.75, max]
    : Array.from({ length: Math.round(max / integerStep) + 1 }, (_, index) => index * integerStep);
  const axis = options.showAxis
    ? axisValues.map(value => {
        const fraction = value / max;
        const x = labelW + chartW * fraction;
        const formatted = options.formatValue === PERCENT
          ? `${Math.round(value)}%`
          : fmt(Math.round(value));
        return `<line data-axis-tick="true" x1="${x.toFixed(1)}" y1="${pad}" x2="${x.toFixed(1)}" y2="${axisY}" stroke="${grid()}" stroke-width="1"/>` +
          `<text x="${x.toFixed(1)}" y="${axisY + 16}" font-size="10" fill="${muted()}" text-anchor="middle">${formatted}</text>`;
      }).join('')
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Helvetica, Arial, sans-serif">${seriesDefs(series.length)}${axis}${rows}</svg>`;
}

/**
 * A print-ready table.
 *
 * HTML, not SVG: a table is text in a grid, and Chromium already lays that out
 * with real typography, hyphenation, and page breaks. Drawing it as SVG would
 * mean reimplementing text measurement to no benefit.
 *
 * `break-inside: avoid` on rows keeps a row off a page boundary, and the header
 * repeats on each page via `thead` — the two things that make a long table
 * usable on paper and that a screenshot of a web table never gives you.
 */
export function tableHtml(
  headers: string[],
  rows: string[][],
  aligns: Array<'left' | 'right'> = []
): string {
  const th = headers
    .map(
      (h, i) =>
        `<th style="text-align:${aligns[i] ?? 'left'};border-bottom:1.5px solid ${ink()};padding:5px 8px;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:${muted()};">${esc(h)}</th>`
    )
    .join('');
  const tr = rows
    .map(
      row =>
        `<tr style="break-inside:avoid;page-break-inside:avoid;">${row
          .map(
            (cell, i) =>
              `<td style="text-align:${aligns[i] ?? 'left'};border-bottom:1px solid ${grid()};padding:5px 8px;font-size:11px;color:${ink()};">${esc(cell)}</td>`
          )
          .join('')}</tr>`
    )
    .join('');
  return `<table style="width:100%;border-collapse:collapse;font-family:Helvetica, Arial, sans-serif;">
    <thead style="display:table-header-group;"><tr>${th}</tr></thead>
    <tbody>${tr}</tbody>
  </table>`;
}

/**
 * KPI tiles, as HTML rather than SVG.
 *
 * The report document is HTML on its way to Chromium, so text-only cards need
 * no SVG at all — and get real text layout, hyphenation, and selectable output
 * in the PDF instead of positioned glyphs.
 */
export function kpiGrid(tiles: { label: string; value: string }[]): string {
  const cells = tiles.map(t => `
    <div style="border:1px solid ${grid()};border-radius:6px;padding:9px 11px;">
      <div style="font-size:9px;letter-spacing:.05em;text-transform:uppercase;color:${muted()};">${esc(t.label)}</div>
      <div style="font-size:15px;font-weight:700;color:${ink()};margin-top:3px;">${esc(t.value)}</div>
    </div>`).join('');
  return `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">${cells}</div>`;
}

/** One postal code's place on the map, and how many households gave it. */
export interface MapPoint {
  label: string;
  latitude: number;
  longitude: number;
  value: number;
}

/**
 * Web Mercator, normalised to 0..1. The projection every slippy map uses, so
 * the printed picture has the same shape as the one on screen.
 */
const mercator = (latitude: number, longitude: number) => {
  const lat = Math.max(-85.05, Math.min(85.05, latitude));
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: (longitude + 180) / 360,
    y: 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI),
  };
};

/** Great-circle-ish miles per degree of longitude at a given latitude. */
const milesPerLonDegree = (latitude: number) => 69.172 * Math.cos((latitude * Math.PI) / 180);

/**
 * A bubble map, drawn from coordinates alone.
 *
 * The screen draws this card with MapLibre over CARTO tiles. None of that can
 * reach a PDF: a saved report re-runs server-side from `templateData` with no
 * browser present, so a canvas capture would work once interactively and break
 * every saved report. Fetching tiles would put a network call inside a report
 * generator that has none, and fail on an offline Pi.
 *
 * What survives is the part that carries the meaning. The postal-code centroids
 * are already computed server-side by `us-zips`, so the distribution — which
 * neighbourhoods, how concentrated, how far the tail reaches — draws from data
 * we hold, deterministically, with no network and no new dependency.
 *
 * **Centred on the most-frequent postal code**, not on the mean or the extent.
 * The mean is dragged by a handful of codes reaching Hawaii and the east coast;
 * the extent would draw the whole country and render the local picture — the
 * entire point of the card — unreadable. The busiest code is deterministic,
 * needs no tuning, and for most agencies will sit at or beside their own
 * address. Codes outside the frame are counted in a note rather than dropped
 * silently.
 *
 * Bubbles scale by **area**, matching the screen: radius from the square root
 * of the count, or a code with twice the households would read as four times.
 */
export function bubbleMapSvg(
  points: MapPoint[],
  width = 900,
  /**
   * Sized to fit, not chosen for looks. A letter-landscape page leaves roughly
   * 447pt under the report header, and the card also carries a title, a note
   * and the ranked key. At 420 the whole card overflowed and `break-inside:
   * avoid` moved it to page two, leaving page one blank below the header.
   */
  height = 330,
  coveragePercent = 0.95,
): string {
  const usable = points.filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && p.value > 0);
  if (usable.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="40" viewBox="0 0 ${width} 40" font-family="Helvetica, Arial, sans-serif">` +
      `<text x="0" y="24" font-size="12" fill="${muted()}">No postal code could be placed on a map.</text></svg>`;
  }

  const busiest = usable.reduce((top, p) => (p.value > top.value ? p : top), usable[0]);
  const centre = mercator(busiest.latitude, busiest.longitude);

  // How far out to draw. Sorting by distance from the centre and taking the
  // radius that covers most households keeps a far-flung code from zooming the
  // whole map out to nothing, without picking an arbitrary mileage.
  const total = usable.reduce((sum, p) => sum + p.value, 0);
  const byDistance = usable
    .map(p => {
      const m = mercator(p.latitude, p.longitude);
      return { p, d: Math.max(Math.abs(m.x - centre.x), Math.abs(m.y - centre.y)) };
    })
    .sort((a, b) => a.d - b.d);
  let seen = 0;
  let span = 0;
  for (const row of byDistance) {
    seen += row.p.value;
    span = row.d;
    if (seen >= total * coveragePercent) break;
  }
  // A single-postal-code range still needs a frame with area in it.
  span = Math.max(span * 1.15, 0.0004);

  const aspect = height / width;
  const halfX = span;
  const halfY = span * aspect;
  const toXY = (p: MapPoint) => {
    const m = mercator(p.latitude, p.longitude);
    return {
      x: ((m.x - centre.x) / (halfX * 2) + 0.5) * width,
      y: ((m.y - centre.y) / (halfY * 2) + 0.5) * height,
    };
  };

  // Land under the circles. Without it this is a scatter plot: the points are
  // in the right places relative to each other and the reader has nothing to
  // place them against.
  const invLat = (yNorm: number) =>
    (Math.atan(Math.sinh(Math.PI * (1 - 2 * yNorm))) * 180) / Math.PI;
  const frameWest = (centre.x - halfX) * 360 - 180;
  const frameEast = (centre.x + halfX) * 360 - 180;
  const frameNorth = invLat(centre.y - halfY);
  const frameSouth = invLat(centre.y + halfY);
  const project = (lon: number, lat: number) => {
    const m = mercator(lat, lon);
    return {
      x: ((m.x - centre.x) / (halfX * 2) + 0.5) * width,
      y: ((m.y - centre.y) / (halfY * 2) + 0.5) * height,
    };
  };
  const land = boundaryRingsFor(frameWest, frameEast, frameSouth, frameNorth)
    .map(ring => {
      const d = ring
        .map(([lon, lat], i) => {
          const { x, y } = project(lon, lat);
          return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join('');
      return `<path d="${d}Z" fill="none" stroke="#C9D4E0" stroke-width="1"/>`;
    })
    .join('');

  /**
   * City names, which are the thing that actually says where this is.
   *
   * Outlines alone gave the aesthetic of a map with nothing identifying in it.
   * Graded by population the way an atlas does, so the eye finds the big places
   * first, and thinned by simple collision rejection — an unreadable pile of
   * overlapping names is worse than four clear ones.
   */
  const placed: { x: number; y: number; w: number }[] = [];
  const places = placesFor(frameWest, frameEast, frameSouth, frameNorth, 8)
    .map(place => {
      const { x, y } = project(place.longitude, place.latitude);
      const major = place.population >= 100000;
      const size = major ? 12 : 9.5;
      const text = major ? place.name.toUpperCase() : place.name;
      const w = text.length * size * 0.58;
      if (x < 4 || x > width - 4 || y < 12 || y > height - 20) return '';
      const clash = placed.some(q => Math.abs(q.x - x) < (q.w + w) / 2 + 6 && Math.abs(q.y - y) < size + 6);
      if (clash) return '';
      placed.push({ x, y, w });
      // Halo, because a place name crossing a bubble is otherwise unreadable —
      // PORTLAND sat under the biggest circle and vanished.
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.6" fill="${muted()}"/>`
        + `<text data-place="${escAttribute(place.name)}" x="${x.toFixed(1)}" y="${(y - 5).toFixed(1)}" font-size="${size}" text-anchor="middle" `
        + `fill="${ink()}" letter-spacing="${major ? 0.8 : 0}" `
        + `stroke="#FFFFFF" stroke-width="2.6" paint-order="stroke" stroke-linejoin="round">${esc(text)}</text>`;
    })
    .join('');

  const largest = Math.max(...usable.map(p => p.value));
  const inFrame = usable.filter(p => {
    const m = mercator(p.latitude, p.longitude);
    return Math.abs(m.x - centre.x) <= halfX && Math.abs(m.y - centre.y) <= halfY;
  });
  const offFrame = usable.length - inFrame.length;
  const offFrameHouseholds = total - inFrame.reduce((sum, p) => sum + p.value, 0);

  // Largest drawn first so a big faint circle cannot hide a small dense one.
  const circles = [...inFrame]
    .sort((a, b) => b.value - a.value)
    .map(p => {
      const { x, y } = toXY(p);
      const r = 3 + 26 * Math.sqrt(p.value / largest);
      return `<circle data-postal-code="${escAttribute(p.label)}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" `
        + `fill="${palette()[1]}" fill-opacity="0.45" stroke="${palette()[0]}" stroke-width="0.8"/>`;
    })
    .join('');

  // Label only the few that carry the story; every circle labelled is a smear.
  const labels = [...inFrame]
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)
    .map(p => {
      const { x, y } = toXY(p);
      const r = 3 + 26 * Math.sqrt(p.value / largest);
      const text = `${p.label} · ${fmt(p.value)}`;
      const w = text.length * 10 * 0.58;
      const ly = y - r - 4;
      // Same `placed` list the city names used, so the two sets cannot collide.
      if (placed.some(q => Math.abs(q.x - x) < (q.w + w) / 2 + 6 && Math.abs(q.y - ly) < 14)) return '';
      placed.push({ x, y: ly, w });
      return `<text x="${x.toFixed(1)}" y="${ly.toFixed(1)}" font-size="10" `
        + `text-anchor="middle" fill="${ink()}" stroke="#FFFFFF" stroke-width="2.6" `
        + `paint-order="stroke" stroke-linejoin="round">${esc(text)}</text>`;
    })
    .join('');

  // A scale bar, because without a basemap there is nothing else to say how
  // far apart these circles are. Sized to a round number of miles.
  const mapWidthMiles = halfX * 2 * 360 * milesPerLonDegree(busiest.latitude);
  const targetMiles = mapWidthMiles / 5;
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500]
    .reduce((best, m) => (Math.abs(m - targetMiles) < Math.abs(best - targetMiles) ? m : best), 1);
  const barW = (step / mapWidthMiles) * width;
  const barY = height - 14;
  const scale = `<line x1="12" y1="${barY}" x2="${(12 + barW).toFixed(1)}" y2="${barY}" stroke="${ink()}" stroke-width="1.5"/>`
    + `<line x1="12" y1="${barY - 3}" x2="12" y2="${barY + 3}" stroke="${ink()}" stroke-width="1.5"/>`
    + `<line x1="${(12 + barW).toFixed(1)}" y1="${barY - 3}" x2="${(12 + barW).toFixed(1)}" y2="${barY + 3}" stroke="${ink()}" stroke-width="1.5"/>`
    + `<text x="${(16 + barW).toFixed(1)}" y="${barY + 4}" font-size="10" fill="${muted()}">${step} mi</text>`;

  const offNote = offFrame > 0
    ? `<text x="12" y="16" font-size="10" fill="${muted()}">`
      + `${esc(fmt(offFrameHouseholds))} households in ${esc(fmt(offFrame))} postal code${offFrame === 1 ? '' : 's'} outside this view</text>`
    : '';

  const clipId = 'mapframe';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Helvetica, Arial, sans-serif">`
    + `<defs><clipPath id="${clipId}"><rect x="0" y="0" width="${width}" height="${height}"/></clipPath></defs>`
    + `<g clip-path="url(#${clipId})">${land}${circles}${places}</g>`
    + labels + scale + offNote
    + `<text x="${width - 6}" y="${height - 5}" font-size="8" text-anchor="end" fill="${muted()}">`
    + `Boundaries: US Census. Places: GeoNames (CC BY).</text>`
    + `<rect x="0" y="0" width="${width}" height="${height}" fill="none" stroke="${grid()}" stroke-width="1"/>`
    + `</svg>`;
}

/**
 * A ranked key beneath a map or chart.
 *
 * A map answers "where" well and "how many, exactly" badly — a reader can see
 * that one circle is the biggest without being able to read a number off it.
 * The key carries the figures the picture only implies, in rank order, so the
 * card answers both questions without the map having to label every circle.
 *
 * Two columns rather than one long list: ten rows stacked vertically push the
 * card onto another page for no reason.
 *
 * `total` is the denominator the share is computed against, and the caller
 * states what it is in `denominatorLabel` — a percentage whose base is not on
 * the page is a number a reader can only misuse.
 */
export function rankedKeySvg(
  rows: { label: string; value: number }[],
  total: number,
  denominatorLabel: string,
  title = 'Top postal codes',
  width = 900,
): string {
  if (rows.length === 0) return '';
  const perColumn = Math.ceil(rows.length / 2);
  const columnW = width / 2;
  const rowH = 15;
  // 38, not 30: the subtitle baseline is at 24 and its descenders reached into
  // the first row, so "Share of the 1,295 households…" printed through
  // "1. 97209".
  const headerH = 38;
  const height = headerH + perColumn * rowH + 6;

  const cells = rows.map((row, i) => {
    const column = Math.floor(i / perColumn);
    const x = column * columnW;
    const y = headerH + (i % perColumn) * rowH;
    const share = total > 0 ? `${((row.value / total) * 100).toFixed(1)}%` : '';
    return `<text x="${x}" y="${y}" font-size="10" fill="${muted()}">${i + 1}.</text>`
      + `<text x="${x + 22}" y="${y}" font-size="11" fill="${ink()}">${esc(row.label)}</text>`
      + `<text x="${x + 210}" y="${y}" font-size="11" text-anchor="end" fill="${ink()}">${esc(fmt(row.value))}</text>`
      + `<text x="${x + 268}" y="${y}" font-size="10" text-anchor="end" fill="${muted()}">${share}</text>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Helvetica, Arial, sans-serif">`
    + `<text x="0" y="12" font-size="11" fill="${ink()}" font-weight="bold">${esc(title)}</text>`
    + `<text x="0" y="24" font-size="9" fill="${muted()}">Share of the ${esc(fmt(total))} ${esc(denominatorLabel)}</text>`
    + cells
    + `</svg>`;
}
