// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import JSZip from 'jszip';

import { renderHtmlToPdf } from '../pdf/chromium';
import { printBrand } from '../brand-config';
import { cardCsv, getAnalyticsCard, type CardData, type CsvGrain } from './analytics-cards';
import {
  DEFAULT_REPORT_PRINT_THEME,
  greyscalePrintTheme,
  withReportPrintTheme,
  type ReportPrintTheme,
} from './print-theme';

/**
 * Assembles a selection of Analytics cards into one downloadable archive.
 *
 * This is the ZEV flow's server half: the client sends the card ids it
 * selected, in the order it selected them, and gets back a single ZIP. There is
 * deliberately no per-card export endpoint — the rejected workflow put a button
 * on every card and left people unsure how to produce a report at all.
 *
 * Card order is the client's order. Selection order is the report's order, and
 * the numbered filenames preserve it outside the PDF too.
 */

const MAX_CARDS = 8;

export interface AnalyticsReportRequest {
  cardIds: string[];
  title: string;
  includePdf: boolean;
  includeCsv: boolean;
  csvGrain: CsvGrain;
  /** Per-card controls, frozen client-side when selection began. */
  cardOptions?: Record<string, unknown>;
}

export interface AnalyticsReportResult {
  zip: Buffer;
  filename: string;
  /** Cards that were requested but are not in the registry. */
  unknownCardIds: string[];
}

const slug = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'report';

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Header and manifest provenance, normalized across the lenses.
 *
 * Each lens describes its span differently: Procurement and Operations carry
 * `range` and `dataAsOf`, while Service reports `coverage` — where the records
 * actually reach, which is the same question asked in the vocabulary of two
 * archives that begin years apart. Normalizing here is what lets a
 * Service-only report print a real header instead of reading a field its
 * payload was never going to have.
 */
interface ReportProvenance {
  range: {
    startDate: string;
    endDate: string;
    preset?: string | null;
    timeZone?: string | null;
  } | null;
  dataAsOf: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filters: any;
}

const provenanceOf = (payloads: LensPayloads): ReportProvenance => {
  const lens = payloads.procurement ?? payloads.operations;
  if (lens) {
    return {
      range: lens.range ?? null,
      dataAsOf: lens.dataAsOf ?? null,
      filters: lens.filters ?? null,
    };
  }

  const coverage = (payloads.service ?? payloads.clients)?.coverage;
  if (coverage) {
    // The latest date any record reaches, not the end of the range asked for —
    // a report run through today should not claim data through today.
    const lastRecorded = (coverage.sources ?? [])
      .map((source: { lastDate: string }) => source.lastDate)
      .sort()
      .pop();
    return {
      range: { startDate: coverage.startDate, endDate: coverage.endDate },
      dataAsOf: lastRecorded ?? null,
      filters: null,
    };
  }

  return { range: null, dataAsOf: null, filters: null };
};

/** The printed document. Cards keep the order they were selected in. */
const documentHtml = (
  title: string,
  organizationName: string,
  provenance: ReportProvenance,
  cards: { data: CardData; svg: string }[],
  theme: ReportPrintTheme,
): string => `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: letter landscape; margin: 0.5in; }
  body { font-family: Helvetica, Arial, sans-serif; color:${theme.ink}; background:${theme.background}; margin:0; }
  header { border-bottom:3px solid ${theme.primary}; padding-bottom:10px; margin-bottom:18px; }
  h1 { font-size:19px; margin:0 0 3px 0; }
  .organization { color:${theme.primary}; font-size:10px; font-weight:700; letter-spacing:.06em;
                  text-transform:uppercase; margin-bottom:3px; }
  .meta { font-size:11px; color:${theme.muted}; line-height:1.5; }
  .card { break-inside: avoid; page-break-inside: avoid; margin-bottom:22px;
          border:1px solid ${theme.grid}; border-radius:8px; padding:14px 16px; }
  .card h2 { font-size:13px; margin:0 0 6px 0; color:${theme.primary};
             text-transform:uppercase; letter-spacing:.06em; }
  .note { font-size:10px; color:${theme.note.ink}; background:${theme.note.background};
          border:1px solid ${theme.note.border};
          border-radius:4px; padding:5px 8px; margin:0 0 10px 0; }
  svg { max-width:100%; height:auto; display:block; }
</style></head><body>
  <header>
    <div class="organization">${escapeHtml(organizationName)}</div>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">
      ${
        provenance.range
          ? `Range ${provenance.range.startDate} – ${provenance.range.endDate}${
              provenance.range.preset ? ` (${provenance.range.preset})` : ''
            }${provenance.range.timeZone ? ` · ${provenance.range.timeZone}` : ''}<br>`
          : ''
      }${
        provenance.filters
          ? `Filters: channel ${provenance.filters.channel ?? 'all'} · acquisition class ${provenance.filters.acquisitionClass ?? 'all'}<br>`
          : ''
      }
      ${provenance.dataAsOf ? `Data as of ${provenance.dataAsOf}` : ''}
    </div>
  </header>
  ${cards
    .map(
      c => `<section class="card"><h2>${escapeHtml(c.data.title)}</h2>${
        c.data.note ? `<p class="note">${escapeHtml(c.data.note)}</p>` : ''
      }${c.svg}</section>`
    )
    .join('')}
</body></html>`;

/**
 * One payload per lens.
 *
 * Operations and Procurement are computed by different services with different
 * range semantics — Operations resolves its range against the pantry's
 * operating-hours timezone and applied schedule revisions. A card reads the
 * payload for its own lens, so the two never have to agree on a shape.
 *
 * Service is a third such lens: it spans intake records and the Service Log,
 * whose coverage begins years apart, and it chooses its own bucket grain from
 * the requested span.
 */
export interface LensPayloads {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  procurement?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  operations?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service?: any;
  /**
   * Who the people served are, rather than what happened on a service day.
   *
   * Reads the same Service analytics today — the client datasets are not
   * imported yet — but is loaded under its own key so the swap, when it comes,
   * does not touch card ids or saved templates.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  clients?: any;
}

export async function buildAnalyticsReport(
  payloads: LensPayloads,
  request: AnalyticsReportRequest
): Promise<AnalyticsReportResult> {
  const brand = await printBrand();
  const theme: ReportPrintTheme = {
    palette: brand.chartColors,
    ink: brand.colors.foreground,
    muted: brand.colors['muted-foreground'],
    grid: brand.colors.border,
    background: brand.colors.background,
    primary: brand.colors.primary,
    primarySoft: brand.colors.accent,
    note: DEFAULT_REPORT_PRINT_THEME.note,
  };
  const ids = request.cardIds.slice(0, MAX_CARDS);
  const unknownCardIds: string[] = [];
  const resolved: { data: CardData; svg: string; id: string }[] = [];
  const drawings: { data: CardData; draw: (variant: ReportPrintTheme) => string }[] = [];

  for (const id of ids) {
    const card = getAnalyticsCard(id);
    // A stale id surfaces rather than being silently dropped — a saved template
    // that quietly produces a smaller report is worse than one that says why.
    if (!card) {
      unknownCardIds.push(id);
      continue;
    }
    const payload = payloads[card.lens];
    // A card whose lens was not loaded is a client bug, but it must not produce
    // a plausible-looking empty chart: skip it and report it like a stale id.
    if (!payload) {
      unknownCardIds.push(id);
      continue;
    }
    const data = card.data(payload, request.cardOptions?.[id]);
    /*
     * The chart is drawn per rendering, not once here.
     *
     * `card.print` reads the print theme from an async-local scope and bakes
     * the series colours into the SVG it returns. Rendering the cards once and
     * handing the same SVG strings to both variants produced a "greyscale" PDF
     * whose document chrome was grey and whose bars were still full Carbon —
     * the exact failure the second rendering exists to prevent. The data is
     * computed once because it does not depend on colour; only the drawing is
     * repeated.
     */
    resolved.push({ id, data, svg: withReportPrintTheme(theme, () => card.print(data)) });
    drawings.push({ data, draw: (variant: ReportPrintTheme) => withReportPrintTheme(variant, () => card.print(data)) });
  }

  // Provenance is reported from whichever lens the report drew on.
  const meta = provenanceOf(payloads);

  const zip = new JSZip();

  if (request.includeCsv) {
    resolved.forEach((card, index) => {
      const position = String(index + 1).padStart(2, '0');
      zip.file(`${position}-${slug(card.data.title)}.csv`, cardCsv(card.data, request.csvGrain));
    });
  }

  if (request.includePdf) {
    /*
     * Two renderings of the same report; the reader chooses which to print.
     *
     * Carbon's categorical grades sit at equal luminance so no series dominates
     * another — right on screen, and what makes the palette colour-vision safe.
     * On paper it means the series are told apart by hue alone, so a mono
     * printer or a photocopy collapses every bar to one grey and the legend
     * becomes the only way to read the chart. Measured on a real export, all
     * four series mapped to greyscale 111/255: a spread of zero.
     *
     * The colour rendering is untouched. The greyscale one converts the
     * document by luminance, which preserves every contrast ratio exactly, then
     * replaces the series ramp — because luminance conversion is precisely what
     * cannot separate colours that differed only in hue.
     */
    const render = (variant: ReportPrintTheme) =>
      renderHtmlToPdf(
        documentHtml(
          request.title,
          brand.config.identity.organizationName,
          meta,
          drawings.map(entry => ({ data: entry.data, svg: entry.draw(variant) })),
          variant
        ),
        {
          width: '11in',
          height: '8.5in',
          margin: { top: '0in', right: '0in', bottom: '0in', left: '0in' },
          displayHeaderFooter: true,
          headerTemplate: '<span></span>',
          footerTemplate: `<div style="width:100%;font-size:8px;font-family:Arial;color:#555;text-align:center;padding-bottom:8px;">
        ${escapeHtml(request.title)} — Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`,
        }
      );

    zip.file(`${slug(request.title)}-color.pdf`, await render(theme));
    zip.file(`${slug(request.title)}-bw.pdf`, await render(greyscalePrintTheme(theme)));
  }

  // Provenance travels with the data. A CSV separated from its range and
  // filters is exactly the misread this is meant to prevent.
  zip.file(
    'manifest.json',
    JSON.stringify(
      {
        title: request.title,
        organization: {
          name: brand.config.identity.organizationName,
          appName: brand.config.identity.appName,
        },
        generatedAt: new Date().toISOString(),
        dataAsOf: meta.dataAsOf,
        range: meta.range,
        filters: meta.filters ?? null,
        cards: resolved.map(c => ({ id: c.id, title: c.data.title, grain: c.data.grain ?? null, note: c.data.note })),
        // Name what is in the archive, so someone reading the manifest knows a
        // black-and-white rendering exists without unzipping to find out.
        artifacts: request.includePdf
          ? [`${slug(request.title)}-color.pdf`, `${slug(request.title)}-bw.pdf`]
          : [],
        csvGrain: request.csvGrain,
        cardOptions: request.cardOptions ?? {},
        unknownCardIds,
      },
      null,
      2
    )
  );

  return {
    zip: await zip.generateAsync({ type: 'nodebuffer' }),
    filename: `${slug(request.title)}-${meta.range?.startDate}-to-${meta.range?.endDate}.zip`,
    unknownCardIds,
  };
}
