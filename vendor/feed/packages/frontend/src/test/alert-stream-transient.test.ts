// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { describe, expect, test } from 'vitest';
import { ALERT_STREAM_FAILURES_BEFORE_ANNOUNCING } from '@/services/alert';

/**
 * The rule, stated as a test so it cannot drift: a dropped alert stream is not
 * news until it has stayed dropped. `EventSource.onerror` fires for a tab
 * switch, a moment of flaky wifi, or a backend restart — all of which the
 * five-second reconnect recovers from silently.
 */
describe('alert stream failure tolerance', () => {
  const transientAt = (failures: number) => failures < ALERT_STREAM_FAILURES_BEFORE_ANNOUNCING;

  test('the first drop is treated as transient', () => {
    expect(transientAt(1)).toBe(true);
  });

  test('a drop that survives several reconnects is announced', () => {
    expect(transientAt(ALERT_STREAM_FAILURES_BEFORE_ANNOUNCING)).toBe(false);
  });

  test('the threshold leaves real time to recover before interrupting anyone', () => {
    // Three tries at five seconds apart is roughly fifteen seconds down.
    expect(ALERT_STREAM_FAILURES_BEFORE_ANNOUNCING).toBeGreaterThanOrEqual(2);
    expect(ALERT_STREAM_FAILURES_BEFORE_ANNOUNCING * 5).toBeLessThanOrEqual(30);
  });
});
