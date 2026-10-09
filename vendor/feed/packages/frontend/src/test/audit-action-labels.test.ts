// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import { AUDIT_ACTION_LABELS } from '@/types/admin';

/**
 * Every action the backend can record must have wording for the Admin history.
 *
 * `BACKUP_RESTORED` and `CLEAN_SLATE_APPLIED` were added to the backend in
 * beta.5/6 and never given labels, so the two entries that matter most — the
 * database was replaced, the database was wiped — appeared in the history as
 * raw SCREAMING_SNAKE identifiers. The audit log is where you look when
 * something drastic happened; that is the worst place for a fallback.
 *
 * The backend enum is read from source rather than imported: it lives in the
 * other package, and the frontend's path aliases do not reach across.
 */
const backendActions = (): string[] => {
  const source = readFileSync(
    join(__dirname, '..', '..', '..', 'backend', 'src', 'services', 'auth', 'authorization.ts'),
    'utf8'
  );

  const block = /export const AUDIT_ACTIONS = \{([\s\S]*?)\} as const;/.exec(source);
  if (!block) throw new Error('AUDIT_ACTIONS not found — has authorization.ts moved?');

  return [...block[1].matchAll(/^\s*([A-Z_]+):\s*'/gm)].map(match => match[1]);
};

describe('audit action labels', () => {
  it('reads a non-trivial enum from the backend', () => {
    // Guards the guard: a regex that silently matched nothing would make every
    // assertion below vacuously true.
    const actions = backendActions();
    expect(actions.length).toBeGreaterThanOrEqual(10);
    expect(actions).toContain('BACKUP_RESTORED');
  });

  it('gives every backend action human wording', () => {
    const missing = backendActions().filter(action => !AUDIT_ACTION_LABELS[action]);

    expect(
      missing,
      `These audit actions would render as raw identifiers in Admin → History. ` +
        `Add wording to AUDIT_ACTION_LABELS in src/types/admin.ts:\n${missing.join('\n')}`
    ).toEqual([]);
  });

  it('has no labels for actions the backend cannot emit', () => {
    // The other direction: a label left behind after an action is removed is
    // dead wording that suggests the action still exists.
    const actions = new Set(backendActions());
    const orphaned = Object.keys(AUDIT_ACTION_LABELS).filter(key => !actions.has(key));

    expect(orphaned, `Labels with no matching backend action:\n${orphaned.join('\n')}`).toEqual([]);
  });
});
