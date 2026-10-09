// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import express from 'express';
import request from 'supertest';
import { describe, expect, test, vi } from 'vitest';

vi.mock('../../../src/services/data-import', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/services/data-import')>()),
  getDataManagementCoverage: vi.fn().mockResolvedValue({
    link2feedVisits: { recordCount: 10, rangeStart: '2026-01-01', rangeEnd: '2026-01-02' },
    simcVisits: { recordCount: 20, rangeStart: '2026-06-01', rangeEnd: '2026-06-02' },
    lottoQueueSessions: { recordCount: 2, rangeStart: '2026-08-01', rangeEnd: '2026-08-02' },
  }),
  listImportHistory: vi.fn().mockResolvedValue([]),
}));

import dataImportRouter from '../../../src/routes/data-import';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.auth = {
    userId: 'history-staff-user',
    email: 'history-staff@example.org',
    role: 'STAFF',
    accessState: 'ALLOWED',
  };
  next();
});
app.use('/api/data-import', dataImportRouter);

describe('unified import history routes', () => {
  test('allows authenticated staff to read organization-wide import history', async () => {
    const response = await request(app).get('/api/data-import/history');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.imports)).toBe(true);
  });

  test('allows authenticated staff to read current organization-wide coverage', async () => {
    const response = await request(app).get('/api/data-import/coverage');

    expect(response.status).toBe(200);
    expect(response.body.coverage).toMatchObject({
      link2feedVisits: { recordCount: 10 },
      simcVisits: { recordCount: 20 },
      lottoQueueSessions: { recordCount: 2 },
    });
  });

  test('keeps lifecycle changes administrator-only', async () => {
    const response = await request(app)
      .post('/api/data-import/history/lifecycle')
      .send({ mode: 'rollback', imports: [{ domain: 'service', id: 1 }] });

    expect(response.status).toBe(403);
    expect(response.body.error).toMatchObject({ code: 'ADMIN_REQUIRED' });
  });
});
