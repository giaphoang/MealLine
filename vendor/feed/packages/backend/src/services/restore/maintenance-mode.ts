// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import type { NextFunction, Request, Response } from 'express';

/**
 * Stop writes while a restore swaps the database underneath the process.
 *
 * **In-memory and process-local, deliberately.** A persisted flag would live in
 * the very file being replaced — so it would either vanish with the swap or,
 * worse, survive a crashed restore and strand the instance in maintenance with
 * no way back except a database edit. A module-level boolean cannot do that: a
 * restart clears it, and `restart: unless-stopped` guarantees the restart.
 *
 * FEED runs one process in one container (docker-compose.yml), so process-local
 * is the whole application. If that ever becomes untrue this must move to
 * something shared, and the restore mechanism needs revisiting anyway.
 *
 * Reads keep working. Staff can look up a limit or a phone number while they
 * wait; only mutations are refused.
 */

interface MaintenanceState {
  active: boolean;
  /** Human-readable label of whoever started it, for the refusal message. */
  startedBy: string | null;
  startedAt: Date | null;
  /** What is happening — "Restoring a backup", "Resetting to a clean slate". */
  reason: string | null;
}

const state: MaintenanceState = {
  active: false,
  startedBy: null,
  startedAt: null,
  reason: null,
};

export const MaintenanceMode = {
  enter(reason: string, startedBy: string): void {
    state.active = true;
    state.reason = reason;
    state.startedBy = startedBy;
    state.startedAt = new Date();
  },

  /**
   * Only reachable if a restore fails before the swap. A successful restore
   * ends by exiting the process, so it never calls this.
   */
  exit(): void {
    state.active = false;
    state.reason = null;
    state.startedBy = null;
    state.startedAt = null;
  },

  get active(): boolean {
    return state.active;
  },

  snapshot(): Readonly<MaintenanceState> {
    return { ...state };
  },
};

/** Methods that change data. Everything else is a read and stays available. */
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Refuse mutations with 503 while maintenance is active.
 *
 * 503 rather than 423 or 409: this is "the service is temporarily unable to
 * handle the request", it is genuinely temporary, and clients already treat it
 * as retryable. The message names what is happening and who started it, so a
 * staff member who hits it can go and ask that person rather than filing a bug.
 *
 * Mounted after `jwtAuthMiddleware` so an unauthenticated caller still gets
 * 401 first — maintenance is not an authentication bypass.
 */
export const maintenanceGuard = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!state.active || !MUTATING.has(req.method)) {
    next();
    return;
  }

  const who = state.startedBy ?? 'an administrator';
  const what = state.reason ?? 'Maintenance';

  res.status(503).json({
    success: false,
    error: {
      code: 'MAINTENANCE_MODE',
      message:
        `${what} is in progress, started by ${who}. ` +
        'FEED will restart on its own in a few seconds. ' +
        'You can keep reading, but changes cannot be saved right now — ' +
        'wait for the page to reload, then try again.',
    },
  });
};
