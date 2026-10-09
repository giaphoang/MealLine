// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import express from 'express';
import request from 'supertest';
import { describe, expect, test } from 'vitest';
import dataImportRouter from '../../../src/routes/data-import';
import {
  inspectCsvHeader,
  LINK2FEED_VISIT_ALLOWED_HEADERS,
  parseCsvHeaderRecord,
  SIMC_SERVICE_VISIT_ALLOWED_HEADERS,
  WTH_SERVICE_TRACKING_HEADERS,
} from '../../../src/services/data-import';
import {
  FRESH_ALLIANCE_HEADERS,
  OFB_HEADERS,
  UNIFIED_HEADERS,
} from '../../../src/services/procurement/contracts';

describe('backend Add Data source registry', () => {
  test('parses quoted header fields without inspecting data rows', () => {
    expect(parseCsvHeaderRecord('"First, field",Second,"Third ""quoted"""\r\nsecret,value,row'))
      .toEqual(['First, field', 'Second', 'Third "quoted"']);
  });

  test('recognizes the existing OFB unified contract from its canonical headers', () => {
    expect(inspectCsvHeader(`${UNIFIED_HEADERS.join(',')}\n`)).toMatchObject({
      status: 'detected',
      contract: { id: 'ofb_unified_v2', domain: 'procurement', readiness: 'operational' },
      ignoredFieldCount: 0,
    });
  });

  test('recognizes retired single-channel OFB schemas without marking them operational', () => {
    for (const headers of [OFB_HEADERS, FRESH_ALLIANCE_HEADERS]) {
      expect(inspectCsvHeader(`${headers.join(',')}\n`)).toMatchObject({
        status: 'detected',
        contract: {
          domain: 'procurement',
          readiness: 'prototype',
          nextStep: 'Export the supported unified OFB file and try again.',
        },
      });
    }
  });

  test('recognizes Link2Feed visits and reports only an ignored-field count', () => {
    const result = inspectCsvHeader([
      ...LINK2FEED_VISIT_ALLOWED_HEADERS,
      'Client First Name',
      'Client Last Name',
      'Email Address',
      'Street Address',
    ].join(','));

    expect(result).toMatchObject({
      status: 'detected',
      contract: { id: 'link2feed_visits_v1', domain: 'service' },
      headerCount: 27,
      recognizedFieldCount: 23,
      ignoredFieldCount: 4,
    });
    expect(JSON.stringify(result)).not.toContain('Client First Name');
    expect(JSON.stringify(result)).not.toContain('Email Address');
  });

  test('recognizes the WTH long-form Tracking boundary, not workbook coordinates', () => {
    expect(inspectCsvHeader(WTH_SERVICE_TRACKING_HEADERS.join(','))).toMatchObject({
      status: 'detected',
      contract: { id: 'wth_service_tracking_v1', domain: 'service', readiness: 'operational' },
    });
  });

  test('recognizes SIMC member rows while ignoring extra export columns', () => {
    expect(inspectCsvHeader([...SIMC_SERVICE_VISIT_ALLOWED_HEADERS, 'Neighbor First Name'].join(',')))
      .toMatchObject({
        status: 'detected',
        contract: { id: 'simc_service_visits_v1', domain: 'service', readiness: 'operational' },
        recognizedFieldCount: SIMC_SERVICE_VISIT_ALLOWED_HEADERS.length,
        ignoredFieldCount: 1,
      });
  });

  test('does not return a parser override for an unknown file', () => {
    expect(inspectCsvHeader('alpha,beta,gamma')).toEqual({
      status: 'unknown',
      message: 'FEED could not identify this CSV. Choose a registered OFB, Link2Feed, SIMC, or FEED-formatted WTH export.',
    });
  });
});

describe('POST /api/data-import/inspect-header', () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = {
      userId: 'source-contract-test-user',
      email: 'source-contract-test@example.org',
      role: 'ADMINISTRATOR',
      accessState: 'ALLOWED',
    };
    next();
  });
  app.use('/api/data-import', dataImportRouter);

  test('returns the typed inspection without persisting or receiving row values', async () => {
    const response = await request(app)
      .post('/api/data-import/inspect-header')
      .send({ container: 'csv', headerText: LINK2FEED_VISIT_ALLOWED_HEADERS.join(',') });

    expect(response.status).toBe(200);
    expect(response.body.inspection).toMatchObject({
      status: 'detected',
      contract: { id: 'link2feed_visits_v1' },
    });
  });

  test('returns an ASK-aligned contract error for malformed requests', async () => {
    const response = await request(app)
      .post('/api/data-import/inspect-header')
      .send({ container: 'xlsx', headerText: '' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'INVALID_DATA_HEADER',
      message: 'Send one UTF-8 CSV header row for inspection.',
    });
  });
});
