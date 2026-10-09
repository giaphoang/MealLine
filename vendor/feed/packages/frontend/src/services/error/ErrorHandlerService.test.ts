// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { describe, it, expect, vi, beforeEach } from 'vitest';

type ToastInput = { description?: string };
const toastMock = vi.fn((args: ToastInput) => {
  void args;
  return { id: 'toast', dismiss: vi.fn(), update: vi.fn() };
});
vi.mock('@/components/ui/use-toast', () => ({
  toast: (args: ToastInput) => toastMock(args),
}));

import { ErrorHandlerService } from './ErrorHandlerService';
import { messageService } from '@/services/message';

const lastToastDescription = (): string =>
  toastMock.mock.calls.at(-1)?.[0]?.description ?? '';

describe('ErrorHandlerService.handleError (ASK-compliant messaging)', () => {
  beforeEach(() => {
    toastMock.mockClear();
    (messageService as unknown as { recent: Map<string, unknown> }).recent.clear();
  });

  it('surfaces a curated backend message verbatim when no override matches', () => {
    const message =
      'The translation service is busy right now (high demand for Arabic). This is temporary -- wait about a minute, then click Generate again. No work was lost.';
    ErrorHandlerService.handleError(new Error(message), 'ctx-1');
    expect(lastToastDescription()).toBe(message);
  });

  it('still applies an errorMessageMap override when one matches', () => {
    ErrorHandlerService.handleError(new Error('Failed to fetch'), 'ctx-2');
    expect(lastToastDescription()).toContain('Network error');
  });

  it('falls back to the generic message for the unknown-error placeholder', () => {
    ErrorHandlerService.handleError(new Error('An unknown error occurred.'), 'ctx-3');
    expect(lastToastDescription()).toBe('An unexpected error occurred. Please try again.');
  });

  it('does not surface developer-facing payloads (JSON / stack traces)', () => {
    ErrorHandlerService.handleError(new Error('{"error":{"code":503}}'), 'ctx-4');
    expect(lastToastDescription()).toBe('An unexpected error occurred. Please try again.');

    ErrorHandlerService.handleError(
      new Error('ApiError: at Models.generateContent (/app/index.cjs:14448:24)'),
      'ctx-5',
    );
    expect(lastToastDescription()).toBe('An unexpected error occurred. Please try again.');
  });

  it('does not surface a bare single-token message', () => {
    ErrorHandlerService.handleError(new Error('UNAVAILABLE'), 'ctx-6');
    expect(lastToastDescription()).toBe('An unexpected error occurred. Please try again.');
  });

  it('collapses the same page-load failure reported by different contexts', () => {
    const error = new Error('An unknown error occurred.');
    ErrorHandlerService.handleError(error, 'lottoQueueData');
    ErrorHandlerService.handleError(error, 'dataImportHistory');
    expect(toastMock).toHaveBeenCalledTimes(1);
  });
});
