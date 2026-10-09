import { beforeEach, expect, test, vi } from 'vitest';
import type { AIConfiguration } from '@prisma/client';

const mocks = vi.hoisted(() => ({ create: vi.fn(), configs: vi.fn(), factory: vi.fn() }));
vi.mock('../../../src/db', () => ({ default: {
  usageRecord: { create: mocks.create }, aIConfiguration: { findMany: mocks.configs },
  $disconnect: vi.fn(),
} }));
vi.mock('../../../src/services/ai/factory/AIServiceFactory', () => ({
  AIServiceFactory: { createServiceFromConfiguration: mocks.factory }
}));
vi.mock('../../../src/services/encryption', () => ({
  encryptApiKey: vi.fn().mockResolvedValue({ encrypted: 'invalid', salt: 'test' })
}));
import { UsageRecordService } from '../../../src/services/usage-record';
import { main, measureRequest, parseArgs, projectedCost } from '../../../scripts/live-smoke';

const config = { id: 99, model: 'claude-fable-5-1', serviceType: 'Anthropic', updatedAt: new Date(),
  inputCost: 10, outputCost: 50, unitPrice: 'per_1m' } as AIConfiguration;
let nextId = 1;
const write = (success: boolean, totalCost: number) => UsageRecordService.createUsageRecord(
  config.id, config, 'classification', { promptTokens: 100, completionTokens: 50, totalCost, success }, config.model!
);
beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = 0;
  nextId = 1;
  mocks.create.mockImplementation(async ({ data }) => ({ id: nextId++, ...data }));
});

test('a thrown operation includes its persisted billed failures', async () => {
  const result = await measureRequest(async () => {
    await write(true, 0.01);
    await write(false, 0.02);
    throw new Error('truncated');
  });
  expect(result.error).toBeInstanceOf(Error);
  expect(result.result).toBeUndefined();
  expect(result.usage).toEqual({ promptTokens: 200, completionTokens: 100, totalCost: 0.03 });
});
test('concurrent activity does not enter another request’s spend', async () => {
  const [a, b] = await Promise.all([
    measureRequest(async () => { await write(false, 0.02); }),
    measureRequest(async () => { await write(true, 0.07); }),
  ]);
  expect(a.usage.totalCost).toBe(0.02);
  expect(b.usage.totalCost).toBe(0.07);
});
test('failed persistence stops measurement instead of inventing zero spend', async () => {
  mocks.create.mockRejectedValue(new Error('database unavailable'));
  await expect(measureRequest(() => write(false, 0.02))).rejects.toThrow(/Stop live testing/);
});
test('reservations respect higher saved prices and legacy per-thousand units', () => {
  const current = projectedCost(config)!;
  expect(projectedCost({ ...config, inputCost: 0.01, outputCost: 0.05, unitPrice: 'per_1k' })).toBeCloseTo(current);
  expect(projectedCost({ ...config, inputCost: 20, outputCost: 100 })).toBeCloseTo(current * 2);
  expect(projectedCost({ ...config, serviceType: 'Google' })).toBeNull();
  expect(projectedCost({ ...config, inputCost: null })).toBeNull();
  expect(projectedCost({ ...config, outputCost: 0 })).toBeNull();
});
test.each(['NaN', 'Infinity', '-1', '0', 'bad'])('invalid ceiling %s is rejected before work', value => {
  expect(() => parseArgs(['--bill', '--ceiling', value])).toThrow(/positive finite/);
});
test('an uncatalogued model can never make a billable call', async () => {
  mocks.configs.mockResolvedValue([{ ...config, model: 'uncatalogued-custom-model' }]);
  const translateText = vi.fn();
  mocks.factory.mockReturnValue({ checkAccess: vi.fn().mockResolvedValue({ ok: false, error: { status: 404 } }), translateText });
  await main(['--bill', '--include-frontier']);
  expect(translateText).not.toHaveBeenCalled();
  expect(process.exitCode).toBe(1);
  process.exitCode = 0;
});
test('a ceiling too small for a request stops before sending it', async () => {
  mocks.configs.mockResolvedValue([config]);
  const translateText = vi.fn();
  mocks.factory.mockReturnValue({ checkAccess: vi.fn().mockResolvedValue({ ok: false, error: { status: 404 } }), translateText });
  await main(['--bill', '--include-frontier', '--ceiling', '0.000001']);
  expect(translateText).not.toHaveBeenCalled();
  expect(process.exitCode).toBe(1);
  process.exitCode = 0;
});
