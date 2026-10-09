// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { describe, expect, test, vi } from 'vitest';
import { BaseApiService, httpStatusMessage } from '@/services/base';
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';

vi.mock('@/services/message', () => ({
  messageService: { error: vi.fn() },
}));

/**
 * ISSUES.md #80. Production v1.6.0 answered a bulk translated-PDF export with
 * Cloudflare 502 pages, and the modal printed each one verbatim — several
 * kilobytes of markup on a row that had room for a sentence. The body is a
 * fair sample of what a gateway sends.
 */
const CLOUDFLARE_502_PAGE = `<!DOCTYPE html>
<html class="no-js" lang="en-US"> <head>
<title>williamtemple.app | 502: Bad gateway</title>
<link rel="stylesheet" id="cf_styles-css" href="/cdn-cgi/styles/main.css" /> </head>
<body> <h1><span class="inline-block">Bad gateway</span>
<span class="code-label">Error code 502</span></h1>
<p>The web server reported a bad gateway error.</p>
<span>Cloudflare Ray ID: <strong>a34dee37bb8569d5</strong></span>
</body> </html>`;

const gatewayResponse = (status: number, body: string, contentType = 'text/html') =>
  new Response(body, { status, headers: { 'content-type': contentType } });

/** Reaches the protected parse helpers the way every real service does. */
class ProbeService extends BaseApiService {
  constructor() {
    super('/api/probe');
  }

  payload(response: Response) {
    return this.parseErrorPayload(response);
  }

  message(response: Response) {
    return this.parseErrorResponse(response);
  }
}

const presentable = (message: string): boolean =>
  (ErrorHandlerService as unknown as {
    isUserPresentableMessage: (value: string, hasServerCode?: boolean) => boolean;
  }).isUserPresentableMessage(message, false);

describe('a gateway error page never becomes the user-facing message', () => {
  test('parseErrorPayload discards the HTML body', async () => {
    const { message, code } = await new ProbeService().payload(
      gatewayResponse(502, CLOUDFLARE_502_PAGE),
    );
    expect(message).not.toContain('<');
    expect(message).not.toContain('Cloudflare');
    expect(message).toBe(httpStatusMessage(502));
    expect(code).toBeUndefined();
  });

  test('parseErrorResponse — the blob/PDF path — discards it too', async () => {
    // createPreviewPdf owns its own fetch and reads only the message, which
    // is how the 502 page reached the Translate & Download PDFs rows.
    const message = await new ProbeService().message(
      gatewayResponse(502, CLOUDFLARE_502_PAGE),
    );
    expect(message).toBe(httpStatusMessage(502));
  });

  test('the replacement passes the toast safety screen', () => {
    expect(presentable(CLOUDFLARE_502_PAGE)).toBe(false);
    for (const status of [502, 503, 504, 520, 524, 500, 429, 413, 404, 403, 400]) {
      expect(presentable(httpStatusMessage(status))).toBe(true);
    }
  });

  test('the 5xx gateway family says it may be restarting and to retry', () => {
    for (const status of [502, 503, 504, 521, 524]) {
      const message = httpStatusMessage(status);
      expect(message).toContain(String(status));
      expect(message).toContain('restarting');
      expect(message).toMatch(/try again/i);
    }
  });

  test('a curated backend message still wins over the status default', async () => {
    const response = new Response(
      JSON.stringify({
        error: {
          message: 'Saved template names must be 48 characters or fewer. Shorten the name and save again.',
          code: 'TEMPLATE_NAME_TOO_LONG',
        },
      }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
    const { message, code } = await new ProbeService().payload(response);
    expect(message).toContain('48 characters');
    expect(code).toBe('TEMPLATE_NAME_TOO_LONG');
  });
});

describe('surfaces that render an error inline share the toast screen', () => {
  test('toUserMessage falls back rather than printing a gateway page', () => {
    const message = ErrorHandlerService.toUserMessage(new Error(CLOUDFLARE_502_PAGE));
    expect(message).not.toContain('<');
    expect(message).toBe('An unexpected error occurred. Please try again.');
  });

  test('toUserMessage passes a curated sentence through unchanged', () => {
    const curated = httpStatusMessage(502);
    expect(ErrorHandlerService.toUserMessage(new Error(curated))).toBe(curated);
  });
});
