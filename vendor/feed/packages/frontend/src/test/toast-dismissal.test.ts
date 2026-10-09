// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useToast, toast } from '@/components/ui/use-toast';

// ISSUES.md #44: toast visibility is governed by a single wall-clock timer in
// use-toast.ts (Radix's own pausable timer is disabled). These tests prove the
// timer fires purely on elapsed time and that manual dismissal cancels it.
// A plain setTimeout cannot be paused by hover/focus/tap, which is the whole
// point — the previous Radix pause-on-interaction left tapped toasts stuck.

const REMOVE_DELAY = 1000;

describe('toast time-only dismissal (ISSUES.md #44)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Drain the module-level toast store so tests don't bleed into each other.
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.dismiss();
    });
    act(() => {
      vi.advanceTimersByTime(REMOVE_DELAY + 100);
    });
    vi.useRealTimers();
  });

  it('auto-dismisses after exactly its explicit duration', () => {
    const { result } = renderHook(() => useToast());
    let id = '';
    act(() => {
      id = toast({ description: 'A message', duration: 5000 }).id;
    });
    const find = () => result.current.toasts.find((t) => t.id === id);

    expect(find()?.open).toBe(true);

    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(find()?.open).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(find()?.open).toBe(false);

    // After the short exit-animation cleanup delay it leaves the store.
    act(() => {
      vi.advanceTimersByTime(REMOVE_DELAY);
    });
    expect(find()).toBeUndefined();
  });

  it('uses the length-aware default when no duration is given', () => {
    const { result } = renderHook(() => useToast());
    let id = '';
    act(() => {
      // "Marked in stock." → clamped to the 3000ms floor.
      id = toast({ description: 'Marked in stock.' }).id;
    });
    const find = () => result.current.toasts.find((t) => t.id === id);

    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(find()?.open).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(find()?.open).toBe(false);
  });

  it('persists indefinitely when duration is null', () => {
    const { result } = renderHook(() => useToast());
    let id = '';
    act(() => {
      id = toast({ description: 'Persistent error', duration: null }).id;
    });
    const find = () => result.current.toasts.find((t) => t.id === id);

    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(find()?.open).toBe(true);
  });

  it('manual dismiss cancels the auto-dismiss timer (no late re-fire)', () => {
    const { result } = renderHook(() => useToast());
    let handle = { id: '', dismiss: () => {} };
    act(() => {
      handle = toast({ description: 'A message', duration: 5000 });
    });
    const find = () => result.current.toasts.find((t) => t.id === handle.id);

    act(() => {
      handle.dismiss();
    });
    expect(find()?.open).toBe(false);

    // Advance well past when the original 5000ms timer would have fired; the
    // toast must already be gone and nothing should throw or resurrect it.
    act(() => {
      vi.advanceTimersByTime(REMOVE_DELAY);
    });
    expect(find()).toBeUndefined();

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(find()).toBeUndefined();
  });
});
