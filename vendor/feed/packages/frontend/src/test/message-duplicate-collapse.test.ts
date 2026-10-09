// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';

const toastMock = vi.fn(() => ({ id: String(Math.random()), dismiss: vi.fn(), update: vi.fn() }));
vi.mock('@/components/ui/use-toast', () => ({ toast: (...args: unknown[]) => toastMock(...(args as [])) }));
vi.mock('@/components/ui/toast', () => ({ ToastAction: 'button' }));

const { messageService, DUPLICATE_MESSAGE_WINDOW_MS } = await import('@/services/message');

describe('duplicate message collapsing', () => {
  beforeEach(() => { toastMock.mockClear(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  /**
   * The real case: three components subscribe to the alert stream and each
   * raised its own toast for one dropped connection, so the user saw the same
   * sentence stacked twice.
   */
  test('several witnesses to one failure produce one toast', () => {
    const text = "We couldn't load alerts right now.";
    messageService.error(text);
    messageService.error(text);
    messageService.error(text);
    expect(toastMock).toHaveBeenCalledTimes(1);
  });

  test('a collapsed caller still gets a working handle', () => {
    const first = messageService.error('Same thing');
    const second = messageService.error('Same thing');
    // The live handle for the toast on screen, so dismiss() still does something.
    expect(second).toBe(first);
  });

  test('different messages are never collapsed together', () => {
    messageService.error('One problem');
    messageService.error('A different problem');
    expect(toastMock).toHaveBeenCalledTimes(2);
  });

  test('the same message is shown again once the window has passed', () => {
    messageService.error('Retry this');
    vi.advanceTimersByTime(DUPLICATE_MESSAGE_WINDOW_MS + 100);
    messageService.error('Retry this');
    // A user who genuinely repeats an action still gets feedback for it.
    expect(toastMock).toHaveBeenCalledTimes(2);
  });

  test('same text at different severities stays distinct', () => {
    messageService.error('Ambiguous');
    messageService.success('Ambiguous');
    expect(toastMock).toHaveBeenCalledTimes(2);
  });
});
