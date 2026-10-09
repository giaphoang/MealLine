import { greyscaleOf } from '../brand-theme/color';
import { PRINT_GREYSCALE_SERIES } from '../brand-theme/charts';
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Request-local print colours used by the server-authored SVG primitives.
 * AsyncLocalStorage keeps simultaneous report requests isolated while retaining
 * the deliberately small card renderer API (`print(data)`).
 */
export interface ReportPrintTheme {
  palette: string[];
  ink: string;
  muted: string;
  grid: string;
  background: string;
  primary: string;
  primarySoft: string;
  /**
   * The caution box printed above a card that carries a data-quality note.
   *
   * These were hardcoded amber in the document CSS, so the black-and-white
   * rendering came out greyscale everywhere except one yellow panel per card —
   * the one element the theme could not reach. Colour belongs to the theme so
   * that converting the theme converts the document.
   */
  note: { ink: string; background: string; border: string };
  /**
   * Whether series past the end of the palette are distinguished by texture.
   *
   * Colour has as many usable hues as a chart has series. Grey does not: the
   * ramp is seven steps before the gaps close below what a printer resolves,
   * and one real card carries twelve series, so five of them came out as exact
   * duplicates of the first five. Texture extends the range without inventing
   * steps that cannot be told apart.
   *
   * Off for the colour rendering, which does not need it and reads worse for
   * the noise. Solid greys are still spent first even here: a chart of seven
   * or fewer series never sees a pattern.
   */
  seriesPatterns?: boolean;
}

export const DEFAULT_REPORT_PRINT_THEME: ReportPrintTheme = {
  palette: ['#2964A3', '#3090A8', '#78C0C0', '#F0D848', '#B08CC0', '#E08050', '#8FB339'],
  ink: '#231F20',
  muted: '#6B7684',
  grid: '#E3E8EE',
  background: '#FFFFFF',
  primary: '#2964A3',
  primarySoft: '#EEF3F8',
  note: { ink: '#8A5A00', background: '#FFF8E1', border: '#FFE9A8' },
};

const reportPrintTheme = new AsyncLocalStorage<ReportPrintTheme>();

export const currentReportPrintTheme = (): ReportPrintTheme =>
  reportPrintTheme.getStore() ?? DEFAULT_REPORT_PRINT_THEME;

export const withReportPrintTheme = <T>(theme: ReportPrintTheme, render: () => T): T =>
  reportPrintTheme.run(theme, render);

/**
 * The same report, rendered for a printer with no colour in it.
 *
 * Everything except the series is converted by luminance, so the document keeps
 * its contrast exactly — a brand heading that cleared 7:1 in colour clears 7:1
 * in grey — and reads as a deliberate black-and-white rendering rather than an
 * accident of the printer.
 *
 * The series ramp is replaced rather than converted, because converting is what
 * fails: Carbon's grades are isoluminant, so luminance conversion maps every
 * one of them to the same grey. `PRINT_GREYSCALE_SERIES` varies lightness
 * instead, which is the only channel left once hue is gone.
 */
export const greyscalePrintTheme = (theme: ReportPrintTheme): ReportPrintTheme => ({
  ...theme,
  // The ramp's own length, not the colour palette's. Mapping over the colour
  // palette kept its length — seven — so the seventh entry wrapped to a silent
  // duplicate of the first, and `seriesFill` read the array length to decide
  // when to start texturing, which meant the duplicate came out solid.
  palette: [...PRINT_GREYSCALE_SERIES],
  ink: greyscaleOf(theme.ink),
  muted: greyscaleOf(theme.muted),
  grid: greyscaleOf(theme.grid),
  background: greyscaleOf(theme.background),
  primary: greyscaleOf(theme.primary),
  primarySoft: greyscaleOf(theme.primarySoft),
  note: {
    ink: greyscaleOf(theme.note.ink),
    background: greyscaleOf(theme.note.background),
    border: greyscaleOf(theme.note.border),
  },
  seriesPatterns: true,
});
