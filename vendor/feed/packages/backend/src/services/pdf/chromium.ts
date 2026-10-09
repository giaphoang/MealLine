// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Generic Chromium HTML→PDF service, extracted from the Shopping List
 * Builder pipeline (Reports initiative §3) so report exports and builder
 * exports share one browser lifecycle: launch flags, temp-profile cleanup,
 * the domcontentloaded + document.fonts.ready wait (networkidle0 hangs on
 * large data-URL fonts), and HTML escaping. Layout/rendering logic stays
 * with each caller.
 */

import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import puppeteer from 'puppeteer';

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const escapeHtml = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ENTITIES[char]);

/** Reads a font file and inlines it as a data: URL (network stays off). */
export const getFontDataUrl = async (
  dir: string,
  fileName: string
): Promise<string> => {
  const fontBuffer = await fs.readFile(path.join(dir, fileName));
  return `data:font/truetype;base64,${fontBuffer.toString('base64')}`;
};

/** One inlined @font-face rule. `weight` may be a range ("100 900"). */
export const fontFaceRule = async (
  dir: string,
  family: string,
  fileName: string,
  weight: number | string,
  style: 'normal' | 'italic' = 'normal'
): Promise<string> => {
  const dataUrl = await getFontDataUrl(dir, fileName);
  return `
    @font-face {
      font-family: "${family}";
      src: url("${dataUrl}") format("truetype");
      font-weight: ${weight};
      font-style: ${style};
    }`;
};

export const NOTO_SANS_FONT_DIR = path.join(
  process.cwd(),
  'assets',
  'fonts',
  'noto-sans'
);

// Cached Noto Sans (regular/bold/italics) CSS bundle for report-style
// documents. The builder keeps its own cache with symbol/RTL/CJK variants.
let reportFontCssPromise: Promise<string> | null = null;

export const getReportFontCss = (): Promise<string> => {
  if (!reportFontCssPromise) {
    reportFontCssPromise = Promise.all([
      fontFaceRule(NOTO_SANS_FONT_DIR, 'Noto Sans', 'NotoSans-Regular.ttf', 400),
      fontFaceRule(NOTO_SANS_FONT_DIR, 'Noto Sans', 'NotoSans-Bold.ttf', 700),
      fontFaceRule(NOTO_SANS_FONT_DIR, 'Noto Sans', 'NotoSans-Italic.ttf', 400, 'italic'),
      fontFaceRule(NOTO_SANS_FONT_DIR, 'Noto Sans', 'NotoSans-BoldItalic.ttf', 700, 'italic'),
    ]).then((rules) => rules.join('\n'));
  }
  return reportFontCssPromise;
};

export interface ChromiumPdfOptions {
  /** Page size; defaults to Letter portrait. */
  width?: string;
  height?: string;
  margin?: { top: string; right: string; bottom: string; left: string };
  preferCSSPageSize?: boolean;
  /** Chromium-native repeating header/footer (Page X of Y support). */
  displayHeaderFooter?: boolean;
  headerTemplate?: string;
  footerTemplate?: string;
  /** Bump for huge inlined assets (builder CJK fonts need 120s). */
  protocolTimeout?: number;
}

/** Only self-contained resources may load while rendering print HTML. */
export const isAllowedPdfResourceUrl = (url: string): boolean =>
  url === 'about:blank' || url.startsWith('data:');

/**
 * Renders self-contained HTML to a PDF buffer. The HTML must not reference
 * external resources; inline everything (styles, SVG, data-URL fonts).
 */
export async function renderHtmlToPdf(
  html: string,
  options: ChromiumPdfOptions = {}
): Promise<Buffer> {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wth-pdf-'));
  const browser = await puppeteer.launch({
    headless: process.env.NOURISH_PDF_BROWSER_MODE === 'shell' ? 'shell' : true,
    userDataDir,
    protocolTimeout: options.protocolTimeout ?? 120000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-crash-reporter',
      '--disable-crashpad',
    ],
    ...(process.env.PUPPETEER_EXECUTABLE_PATH
      ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
      : {}),
  });

  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    // `continue()` / `abort()` reject when the request was already handled or
    // the target went away mid-render, and nothing awaits this listener. An
    // unhandled rejection is fatal to Node by default, so one late reject
    // here takes the whole API down -- and it lands *after* the PDF response
    // was sent, which makes the next request look like the culprit. Nothing
    // downstream can act on these, so swallow them deliberately.
    const ignoreLateInterception = () => {};
    page.on('request', (request) => {
      if (isAllowedPdfResourceUrl(request.url())) {
        request.continue().catch(ignoreLateInterception);
      } else {
        request.abort('blockedbyclient').catch(ignoreLateInterception);
      }
    });
    // Wait only for the DOM to parse, then explicitly wait for the CSS
    // Font Loading API. `networkidle0` hangs indefinitely when fonts are
    // inlined as huge data URLs (Chromium treats them as in-flight
    // requests that never reach idle); `domcontentloaded` +
    // `document.fonts.ready` is deterministic.
    await page.setContent(html, {
      waitUntil: 'domcontentloaded',
      timeout: options.protocolTimeout ?? 120000,
    });
    await page.evaluate('document.fonts.ready');
    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: options.preferCSSPageSize ?? true,
      width: options.width ?? '8.5in',
      height: options.height ?? '11in',
      margin: options.margin ?? {
        top: '0in',
        right: '0in',
        bottom: '0in',
        left: '0in',
      },
      ...(options.displayHeaderFooter
        ? {
            displayHeaderFooter: true,
            headerTemplate: options.headerTemplate ?? '<span></span>',
            footerTemplate: options.footerTemplate ?? '<span></span>',
          }
        : {}),
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
    await fs.rm(userDataDir, { recursive: true, force: true });
  }
}
