// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OTPTab } from '@/components/auth/otp-tab';

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

/**
 * A refused sign-in must not advance to the code-entry step.
 *
 * The revoked-access work made this reachable: the server now answers
 * /otp/request with 403 and never sends mail, but the tab treated every
 * failure as "advance and show the error". The result told the user "Code sent
 * to <address>" directly above a message saying they are not allowed in, and
 * offered a six-digit field for a code that did not exist.
 */
describe('OTPTab — refused request', () => {
  const DENIAL =
    'FEED access is limited to authorized staff. Contact technology@williamtemple.org for access.';

  const mockFetch = (ok: boolean, body: unknown) =>
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok,
      json: async () => body,
    } as unknown as Response);

  const submitEmail = (address: string) => {
    render(<OTPTab />);
    fireEvent.change(screen.getByLabelText(/work email/i), {
      target: { value: address },
    });
    fireEvent.click(screen.getByRole('button', { name: /send 6-digit code/i }));
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Let `input-otp`'s selection-mirror timers finish while jsdom still exists.
   *
   * The third test reaches the code step, which mounts `InputOTP`. Its effect
   * calls a helper that schedules the same callback three times — at 0ms, 10ms
   * and 50ms — and returns the timer ids, but the effect never returns a
   * cleanup, so unmounting does not clear them. (The neighbouring
   * password-manager effect in the same file does clear its timers, so this is
   * an oversight upstream rather than a deliberate design.) `cleanup()` in
   * src/test/setup.ts unmounts the component correctly; the timers survive it
   * regardless.
   *
   * When one fires after the environment is torn down, the callback reaches a
   * React state setter, React asks for the update priority, and that touches
   * `window`, which is gone:
   *
   *   ReferenceError: window is not defined
   *     ❯ resolveUpdatePriority react-dom-client.development.js
   *     ❯ Timeout._onTimeout input-otp/src/input.tsx:250
   *
   * The whole suite then exits 1 while reporting every test passed — which is
   * worse than a plain failure, because it teaches everyone to disregard the
   * exit code that CI actually reads.
   *
   * Waiting past the longest of the three is what makes this deterministic; a
   * single macrotask tick would flush only the 0ms one and leave the flake
   * exactly as intermittent as before. It costs ~60ms per test in this file
   * and nothing anywhere else, which is why it lives here rather than in the
   * shared setup.
   */
  afterEach(async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
  });

  it('stays on the email step and explains why, with no code prompt', async () => {
    mockFetch(false, { error: { message: DENIAL, code: 'ACCESS_DENIED' } });

    submitEmail('revoked@williamtemple.org');

    await waitFor(() => {
      expect(screen.getByText(DENIAL)).toBeInTheDocument();
    });

    // The contradiction that was reported: both of these used to be on screen
    // at the same time as the refusal above.
    expect(screen.queryByText(/code sent to/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/enter 6-digit code/i)).not.toBeInTheDocument();

    // And the user can correct the address and try again from here.
    expect(screen.getByLabelText(/work email/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /send 6-digit code/i })
    ).toBeInTheDocument();
  });

  it('clears the refusal once the address is edited', async () => {
    mockFetch(false, { error: { message: DENIAL, code: 'ACCESS_DENIED' } });

    submitEmail('revoked@williamtemple.org');
    await waitFor(() => expect(screen.getByText(DENIAL)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/work email/i), {
      target: { value: 'someone.else@williamtemple.org' },
    });

    await waitFor(() => {
      expect(screen.queryByText(DENIAL)).not.toBeInTheDocument();
    });
  });

  it('still advances to the code step when a code really was sent', async () => {
    mockFetch(true, { success: true });

    submitEmail('staff@williamtemple.org');

    await waitFor(() => {
      expect(screen.getByText(/enter 6-digit code/i)).toBeInTheDocument();
    });
    expect(
      screen.getByText(/code sent to staff@williamtemple\.org/i)
    ).toBeInTheDocument();
  });
});
