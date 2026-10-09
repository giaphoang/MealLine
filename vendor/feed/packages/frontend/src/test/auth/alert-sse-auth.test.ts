// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertService } from '@/services/alert';

describe('AlertService SSE authentication', () => {
  const OriginalEventSource = globalThis.EventSource;

  beforeEach(() => {
    const eventSourceMock = vi.fn().mockImplementation(() => ({
      close: vi.fn(),
      onmessage: null,
      onerror: null,
    }));

    globalThis.EventSource = eventSourceMock as unknown as typeof EventSource;
  });

  afterEach(() => {
    globalThis.EventSource = OriginalEventSource;
    vi.restoreAllMocks();
  });

  it('connects with credentials and no auth query param', () => {
    const service = new AlertService();

    service.connectToAlertStream();

    const eventSourceMock = globalThis.EventSource as unknown as { mock: { calls: Array<[string, EventSourceInit]> } };
    const [url, options] = eventSourceMock.mock.calls[0];

    expect(url).toContain('/api/alerts/stream');
    expect(url).not.toContain('auth=');
    expect(options).toEqual({ withCredentials: true });
  });
});
