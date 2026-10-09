// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { beforeEach, describe, expect, test, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockPrisma = vi.hoisted(() => ({
  reportTemplate: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock('../../src/db', () => ({ default: mockPrisma }));

describe('Analytics report template bulk deletion', () => {
  let app: express.Application;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      async (callback: (transaction: typeof mockPrisma) => Promise<unknown>) =>
        callback(mockPrisma)
    );

    app = express();
    app.use(express.json());
    const router = (await import('../../src/routes/analytics-reports')).default;
    app.use('/api/analytics-reports', router);
    app.use(
      (
        error: Error & { statusCode?: number },
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction
      ) => res.status(error.statusCode ?? 500).json({ error: { message: error.message } })
    );
  });

  test('deletes multiple analytics templates in one transaction', async () => {
    mockPrisma.reportTemplate.findMany.mockResolvedValue([{ id: 4 }, { id: 9 }]);
    mockPrisma.reportTemplate.deleteMany.mockResolvedValue({ count: 2 });

    const response = await request(app)
      .delete('/api/analytics-reports/templates/bulk')
      .send({ ids: [4, 9] })
      .expect(200);

    expect(response.body).toEqual({ deleted: 2 });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.reportTemplate.findMany).toHaveBeenCalledWith({
      where: { id: { in: [4, 9] }, source: 'analytics' },
      select: { id: true },
    });
    expect(mockPrisma.reportTemplate.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [4, 9] }, source: 'analytics' },
    });
  });

  test.each([
    ['an empty selection', { ids: [] }],
    ['duplicate ids', { ids: [4, 4] }],
    ['a non-integer id', { ids: [4, 4.5] }],
    ['an unknown field', { ids: [4], source: 'other' }],
  ])('rejects %s before starting a transaction', async (_label, body) => {
    await request(app)
      .delete('/api/analytics-reports/templates/bulk')
      .send(body)
      .expect(400);

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  test('deletes nothing when any requested id is missing or belongs to another source', async () => {
    // The source constraint makes a dormant-workspace template indistinguishable
    // from a missing id through this route, which is the intended boundary.
    mockPrisma.reportTemplate.findMany.mockResolvedValue([{ id: 4 }]);

    const response = await request(app)
      .delete('/api/analytics-reports/templates/bulk')
      .send({ ids: [4, 9] })
      .expect(404);

    expect(response.body.error).toMatchObject({ code: 'TEMPLATE_NOT_FOUND' });
    expect(mockPrisma.reportTemplate.deleteMany).not.toHaveBeenCalled();
  });

  test('rejects a selection that changes during deletion instead of reporting partial success', async () => {
    mockPrisma.reportTemplate.findMany.mockResolvedValue([{ id: 4 }, { id: 9 }]);
    mockPrisma.reportTemplate.deleteMany.mockResolvedValue({ count: 1 });

    const response = await request(app)
      .delete('/api/analytics-reports/templates/bulk')
      .send({ ids: [4, 9] })
      .expect(404);

    expect(response.body.error).toMatchObject({ code: 'TEMPLATE_NOT_FOUND' });
  });
});
