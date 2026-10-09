// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseApiService } from '@/services/base';

class TestService extends BaseApiService {
  async ping() {
    return this.get<{ ok: boolean }>('/ping');
  }
}

describe('BaseApiService authentication', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('sends cookies and omits Basic auth headers', async () => {
    const service = new TestService('/api/test');

    await service.ping();

    const [, options] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(options.credentials).toBe('include');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.headers.Authorization).toBeUndefined();
  });
});
