// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import express from 'express';
import request from 'supertest';
import { describe, expect, test } from 'vitest';
import dataImportRouter from '../../../src/routes/data-import';
import { LINK2FEED_VISIT_ALLOWED_HEADERS } from '../../../src/services/data-import';

const appWithRole = (role: 'ADMINISTRATOR' | 'STAFF') => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = {
      userId: 'route-test-user',
      email: 'route-test@example.org',
      role,
      accessState: 'ALLOWED',
    };
    next();
  });
  app.use('/api/data-import', dataImportRouter);
  return app;
};

describe('unified Add Data routes', () => {
  test('keeps source inspection and persistent import actions administrator-only', async () => {
    const response = await request(appWithRole('STAFF'))
      .post('/api/data-import/inspect-header')
      .send({ container: 'csv', headerText: LINK2FEED_VISIT_ALLOWED_HEADERS.join(',') });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ADMIN_REQUIRED');
  });

  test('allows an administrator to use the same classifier that gates persistence', async () => {
    const response = await request(appWithRole('ADMINISTRATOR'))
      .post('/api/data-import/inspect-header')
      .send({ container: 'csv', headerText: LINK2FEED_VISIT_ALLOWED_HEADERS.join(',') });

    expect(response.status).toBe(200);
    expect(response.body.inspection).toMatchObject({
      status: 'detected',
      contract: { id: 'link2feed_visits_v1' },
    });
  });

  test('rejects a non-CSV persistent upload before creating a job', async () => {
    const response = await request(appWithRole('ADMINISTRATOR'))
      .post('/api/data-import/jobs')
      .set('Content-Type', 'application/json')
      .send({ not: 'a CSV' });

    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe('INVALID_DATA_IMPORT_MEDIA_TYPE');
  });
});
