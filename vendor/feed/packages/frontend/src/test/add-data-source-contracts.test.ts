// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  detectCsvSource,
  OFB_AGENCY_PICKUP_HEADERS,
  OFB_COMPLETED_ORDER_HEADERS,
  parseCsvHeader,
  SIMC_SERVICE_VISIT_ALLOWED_HEADERS,
} from '@/components/data-management/add-data/source-contracts';

const fixture = (name: string) => readFileSync(
  resolve(process.cwd(), 'src/test/fixtures/add-data', name),
  'utf8',
);

describe('unified Add Data source contracts', () => {
  test('parses quoted CSV headers without splitting embedded commas', () => {
    expect(parseCsvHeader('"First, field",Second,"Third ""quoted"""\r\n1,2,3')).toEqual([
      'First, field',
      'Second',
      'Third "quoted"',
    ]);
  });

  test('detects the current unified OFB export exactly', () => {
    const result = detectCsvSource(fixture('ofb-unified.csv'));
    expect(result.status).toBe('detected');
    if (result.status !== 'detected') return;
    expect(result.contract.id).toBe('ofb_unified_v2');
    expect(result.contract.domain).toBe('procurement');
    expect(result.ignoredHeaders).toEqual([]);
  });

  test('recognizes retired single-channel OFB files without marking them importable', () => {
    for (const headers of [OFB_COMPLETED_ORDER_HEADERS, OFB_AGENCY_PICKUP_HEADERS]) {
      const result = detectCsvSource(`${headers.join(',')}\n`);
      expect(result.status).toBe('detected');
      if (result.status !== 'detected') continue;
      expect(result.contract.status).toBe('prototype');
      expect(result.contract.nextStep).toMatch(/unified OFB file/i);
    }
  });

  test('detects Link2Feed visits while treating extra PII columns as irrelevant', () => {
    const result = detectCsvSource(fixture('link2feed-visits-with-extra-columns.csv'));
    expect(result.status).toBe('detected');
    if (result.status !== 'detected') return;
    expect(result.contract.id).toBe('link2feed_visits_v1');
    expect(result.recognizedHeaders).toHaveLength(23);
    expect(result.ignoredHeaders).toEqual([
      'Client First Name',
      'Client Last Name',
      'Email Address',
      'Street Address',
    ]);
    expect(result.contract.transformations).toContain(
      'Discard Notes. Service-method detail comes from WTH Tracking or FEED-native Service Logs.'
    );
  });

  test('keeps the provisional Link2Feed client contract separate from visits', () => {
    const result = detectCsvSource(fixture('link2feed-clients.csv'));
    expect(result.status).toBe('detected');
    if (result.status !== 'detected') return;
    expect(result.contract.id).toBe('link2feed_clients_v1');
    expect(result.contract.status).toBe('pending-sample');
  });

  test('detects SIMC service visits without exposing extra PII columns as relevant', () => {
    const result = detectCsvSource([
      [...SIMC_SERVICE_VISIT_ALLOWED_HEADERS, 'Neighbor First Name'].join(','),
      'synthetic,data',
    ].join('\n'));
    expect(result.status).toBe('detected');
    if (result.status !== 'detected') return;
    expect(result.contract.id).toBe('simc_service_visits_v1');
    expect(result.contract.status).toBe('operational');
    expect(result.ignoredHeaders).toEqual(['Neighbor First Name']);
  });

  test('detects the long-form WTH migration export rather than spreadsheet layout', () => {
    const result = detectCsvSource(fixture('wth-service-tracking.csv'));
    expect(result.status).toBe('detected');
    if (result.status !== 'detected') return;
    expect(result.contract.id).toBe('wth_service_tracking_v1');
    expect(result.contract.domain).toBe('service');
    expect(result.contract.status).toBe('operational');
  });

  test('detects canonical LOTTO queue history as a staff-level operational import', () => {
    const result = detectCsvSource('FEED Schema Version,Summary JSON\n1,"{}"');
    expect(result.status).toBe('detected');
    if (result.status !== 'detected') return;
    expect(result.contract.id).toBe('lotto_queue_history_v1');
    expect(result.contract.domain).toBe('service');
    expect(result.contract.status).toBe('operational');
  });

  test('does not ask the user to force an unknown file through a parser', () => {
    expect(detectCsvSource(fixture('unknown.csv'))).toEqual({
      status: 'unknown',
      headers: ['alpha', 'beta', 'gamma'],
    });
  });
});
