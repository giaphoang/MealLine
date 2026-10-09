// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const serviceMocks = vi.hoisted(() => ({
  listServiceMetricConfigurations: vi.fn(),
  seedWthServiceConfiguration: vi.fn(),
  createServiceMetricConfiguration: vi.fn(),
  updateServiceMetricConfiguration: vi.fn(),
  getServiceDay: vi.fn(),
  saveServiceDay: vi.fn(),
}));

vi.mock('../../../src/services/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/services/service')>()),
  ...serviceMocks,
}));

import serviceRouter from '../../../src/routes/service';

const appWithRole = (role: 'ADMINISTRATOR' | 'STAFF') => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = {
      userId: `${role.toLowerCase()}-user`,
      email: `${role.toLowerCase()}@example.org`,
      role,
      accessState: 'ALLOWED',
    };
    next();
  });
  app.use('/api/service', serviceRouter);
  return app;
};

const emptyDay = {
  serviceDate: '2026-08-10',
  pantryStatus: 'open',
  entryState: 'draft',
  dayRevision: 0,
  metrics: [],
  operationalTotal: { value: null, recordedMetricCount: 0, expectedMetricCount: 0, complete: false },
  capacityPlan: null,
};

describe('Service Log routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.listServiceMetricConfigurations.mockResolvedValue([]);
    serviceMocks.seedWthServiceConfiguration.mockResolvedValue({
      metricsCreated: 7,
      metricsSkipped: 0,
      capacityPlanCreated: true,
    });
    serviceMocks.getServiceDay.mockResolvedValue(emptyDay);
    serviceMocks.saveServiceDay.mockResolvedValue(emptyDay);
    serviceMocks.createServiceMetricConfiguration.mockResolvedValue({ id: 1 });
  });

  test('keeps metric configuration administrator-only', async () => {
    const response = await request(appWithRole('STAFF')).get('/api/service/metrics');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ADMIN_REQUIRED');
    expect(serviceMocks.listServiceMetricConfigurations).not.toHaveBeenCalled();
  });

  test('lets an administrator seed WTH defaults with audit attribution', async () => {
    const response = await request(appWithRole('ADMINISTRATOR'))
      .post('/api/service/metrics/wth-defaults')
      .send({});
    expect(response.status).toBe(201);
    expect(response.body.metricsCreated).toBe(7);
    expect(serviceMocks.seedWthServiceConfiguration).toHaveBeenCalledWith('administrator-user');
  });

  test('accepts an ordinal metric position and rejects the internal order field', async () => {
    const metric = {
      displayName: 'Delivery Requests',
      description: null,
      iconName: 'shopping-bag',
      valueType: 'count',
      unit: 'requests',
      semanticRole: 'ancillary_service',
      contributesToOperationalTotal: false,
      capacityTarget: null,
      effectiveStartDate: '2026-08-13',
      effectiveEndDate: null,
      displayPosition: 2,
      isActive: true,
    };
    const accepted = await request(appWithRole('ADMINISTRATOR'))
      .post('/api/service/metrics')
      .send(metric);
    expect(accepted.status).toBe(201);
    expect(serviceMocks.createServiceMetricConfiguration).toHaveBeenCalledWith(
      metric,
      'administrator-user',
    );

    const { displayPosition: _displayPosition, ...withoutPosition } = metric;
    const rejected = await request(appWithRole('ADMINISTRATOR'))
      .post('/api/service/metrics')
      .send({ ...withoutPosition, displayOrder: 20 });
    expect(rejected.status).toBe(400);
    expect(serviceMocks.createServiceMetricConfiguration).toHaveBeenCalledTimes(1);
  });

  test('lets staff read and save the shared daily log', async () => {
    const read = await request(appWithRole('STAFF')).get('/api/service/days/2026-08-10');
    expect(read.status).toBe(200);
    expect(read.body.day).toMatchObject({ serviceDate: '2026-08-10', entryState: 'draft' });

    const input = { pantryStatus: 'open', entryState: 'draft', observations: [] };
    const saved = await request(appWithRole('STAFF'))
      .put('/api/service/days/2026-08-10')
      .send(input);
    expect(saved.status).toBe(200);
    expect(serviceMocks.saveServiceDay).toHaveBeenCalledWith('2026-08-10', input, 'staff-user');
  });

  test('rejects an invalid date before querying the Service domain', async () => {
    const response = await request(appWithRole('STAFF')).get('/api/service/days/08-10-2026');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_SERVICE_REQUEST');
    expect(serviceMocks.getServiceDay).not.toHaveBeenCalled();
  });
});
