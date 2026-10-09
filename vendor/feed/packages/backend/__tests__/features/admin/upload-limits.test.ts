// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, test } from 'vitest';

import { MAX_ARTIFACT_BYTES } from '../../../src/routes/admin/restore';
import { MAX_STAGED_DATA_IMPORT_BYTES } from '../../../src/services/data-import/staging';

/**
 * The proxy's body limit must not be lower than the application's.
 *
 * These two numbers have now drifted twice, and both times a person found out
 * afterwards, at cost. First: nginx at 16m against a 64MB import ceiling,
 * which cost a production import (ISSUES.md #68). Then: nginx at 64m against
 * restore's 256MB ceiling, which made disaster recovery impossible — a real
 * 152MB production artifact was rejected before the backend saw a byte of it
 * (ISSUES.md #83).
 *
 * Neither is visible in development, and that is the whole reason both
 * survived: the development frontend talks to the backend directly, with no
 * proxy in the path. Only the deployed stack has nginx, so only a deployment
 * — or a Docker rehearsal — can reveal the mismatch. A test that reads the
 * config file is the cheapest way to stop needing one.
 *
 * When nginx rejects a body it does so mid-upload, before any route runs, so
 * the client gets a proxy error page rather than the message the application
 * wrote. Raising the ceiling here is not about permitting bigger files: it is
 * about which layer gets to explain the refusal.
 */

const nginxConf = readFileSync(
  join(__dirname, '../../../../../docker/nginx.conf'),
  'utf8'
);

/** `client_max_body_size` inside the given `location` block, in bytes. */
const limitFor = (location: string): number => {
  const block = new RegExp(
    `location\\s+${location.replace(/[/.]/g, '\\$&')}\\s*\\{([\\s\\S]*?)\\n    \\}`
  ).exec(nginxConf);
  expect(block, `no location block for ${location} in docker/nginx.conf`).not.toBeNull();

  const directive = /client_max_body_size\s+(\d+)([kmg])?;/i.exec(block![1]);
  expect(
    directive,
    `location ${location} declares no client_max_body_size, so it inherits a limit `
      + 'that nothing here checks'
  ).not.toBeNull();

  const scale = { k: 1024, m: 1024 * 1024, g: 1024 * 1024 * 1024 };
  const unit = directive![2]?.toLowerCase() as keyof typeof scale | undefined;
  return Number(directive![1]) * (unit ? scale[unit] : 1);
};

describe('nginx accepts everything the application is prepared to accept', () => {
  test('the restore path admits a full-sized backup artifact', () => {
    // A production backup measured 152MB. The application says 256MB; if the
    // proxy says less, the restore that disaster recovery depends on fails
    // at the door.
    expect(limitFor('/api/admin/restore')).toBeGreaterThanOrEqual(MAX_ARTIFACT_BYTES);
  });

  test('the general API path admits a full-sized data import', () => {
    expect(limitFor('/api/')).toBeGreaterThanOrEqual(MAX_STAGED_DATA_IMPORT_BYTES);
  });

  test('restore has its own block rather than inheriting the general one', () => {
    // Scoped on purpose: the general limit should stay sized for the largest
    // ordinary request, not for the largest request in the application.
    expect(limitFor('/api/admin/restore')).toBeGreaterThan(limitFor('/api/'));
  });
});
