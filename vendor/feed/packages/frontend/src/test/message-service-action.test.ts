// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type React from 'react';

const dismiss = vi.fn();
const update = vi.fn();
const toastMock = vi.fn(() => ({ id: '1', dismiss, update }));
vi.mock('@/components/ui/use-toast', () => ({
  toast: (args: unknown) => toastMock(args),
}));

import { messageService } from '@/services/message';

const lastToastArg = () =>
  toastMock.mock.calls.at(-1)?.[0] as {
    duration?: number | null;
    action?: React.ReactElement<{ onClick: () => void }>;
  };

describe('messageService toast options (ISSUES.md #44)', () => {
  beforeEach(() => {
    toastMock.mockClear();
    dismiss.mockClear();
  });

  it('clicking the action button runs the user handler then closes the toast', () => {
    const onClick = vi.fn();
    messageService.error('Something failed. Please try again.', {
      action: { label: 'Retry', onClick },
    });

    const action = lastToastArg().action;
    expect(action).toBeTruthy();

    // Simulate the user clicking the embedded action button.
    action!.props.onClick();

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('passes a length-aware duration by default', () => {
    messageService.success('OK'); // short → 3000ms floor
    expect(lastToastArg().duration).toBe(3000);

    toastMock.mockClear();
    messageService.error('a'.repeat(65)); // 65×150 = 9750ms
    expect(lastToastArg().duration).toBe(9750);
  });

  it('persisted messages pass duration: null (manual dismissal only)', () => {
    messageService.systemError('Unexpected error');
    expect(lastToastArg().duration).toBeNull();
  });

  it('an explicit duration overrides the length-aware default', () => {
    messageService.info('Short', { duration: 8000 });
    expect(lastToastArg().duration).toBe(8000);
  });
});
