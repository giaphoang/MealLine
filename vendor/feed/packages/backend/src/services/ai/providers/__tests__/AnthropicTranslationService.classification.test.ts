import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { AIConfiguration } from '@prisma/client';

vi.mock('../../../../db', () => ({ default: {} }));
vi.mock('../../../usage-record', () => ({
  UsageRecordService: { createUsageRecord: vi.fn().mockResolvedValue(undefined) }
}));
import { AnthropicTranslationService } from '../AnthropicTranslationService';
import { UsageRecordService } from '../../../usage-record';

const segments = [{ id: 'first', text: 'Pantry hours' }];
const reply = (name: string, input: unknown = { classifications: [{ id: '1', a: 0.8, b: 0.2 }] }) => ({
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', id: 'call_1', name, input }],
  usage: { input_tokens: 900, output_tokens: 100 },
});
const setup = (model: string, response: unknown) => {
  const service = new AnthropicTranslationService({
    id: 901, model, serviceType: 'Anthropic', encryptedApiKey: 'test', salt: 'test',
    maxTokens: 2048, inputCost: 10, outputCost: 50, unitPrice: 'per_1m',
    createdAt: new Date(), updatedAt: new Date(),
  } as AIConfiguration);
  const create = vi.fn().mockResolvedValue(response);
  vi.spyOn(service as any, 'getAnthropicClient').mockResolvedValue({ messages: { create } });
  return { service, create };
};
beforeEach(() => vi.clearAllMocks());

describe('classification tool capability', () => {
  test.each(['classifySegments', 'classifySegmentsBatch'] as const)('%s uses auto for Fable and maps results', async method => {
    const name = method === 'classifySegments' ? 'classify_segments' : 'classify_segments_batch';
    const { service, create } = setup('claude-fable-5-1', reply(name));
    const result = await service[method]({ segments });
    expect(create.mock.calls[0][0].tool_choice).toEqual({ type: 'auto' });
    expect(create.mock.calls[0][0].messages[0].content).toContain(`Use ${name}`);
    expect(result.classifications).toEqual([{ id: 'first', a: 0.8, b: 0.2 }]);
    expect(result.metrics.totalCost).toBeCloseTo(0.014);
    expect(UsageRecordService.createUsageRecord).toHaveBeenCalledTimes(1);
  });
  test.each(['claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5-20251001'])('%s retains forced tools', async model => {
    const { service, create } = setup(model, reply('classify_segments'));
    await service.classifySegments({ segments });
    expect(create.mock.calls[0][0].tool_choice).toEqual({ type: 'tool', name: 'classify_segments' });
  });
  test('an unknown model conservatively uses auto', async () => {
    const { service, create } = setup('claude-custom-test', reply('classify_segments'));
    await service.classifySegments({ segments });
    expect(create.mock.calls[0][0].tool_choice).toEqual({ type: 'auto' });
  });
  test('a failed parallel batch still waits for and records its successful sibling', async () => {
    const { service, create } = setup('claude-fable-5-1', null);
    create.mockRejectedValueOnce(new Error('provider unavailable'));
    create.mockImplementationOnce(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      return reply('classify_segments_batch');
    });
    await expect(service.classifySegmentsBatch({ segments: Array.from({ length: 41 }, (_, i) => ({
      id: String(i), text: `Distinct text ${i}`,
    })) })).rejects.toThrow();
    expect(UsageRecordService.createUsageRecord).toHaveBeenCalledTimes(1);
    const usage = vi.mocked(UsageRecordService.createUsageRecord).mock.calls[0][3];
    expect(usage.success).toBe(true);
    expect(usage.totalCost).toBeCloseTo(0.014);
  });
  test.each([
    { ...reply('wrong_tool') },
    { ...reply('classify_segments'), content: [{ type: 'text', text: 'Here is my answer.' }] },
    reply('classify_segments', { classifications: [] }),
    reply('classify_segments', { classifications: [{ id: '1', a: 2, b: 0 }] }),
    reply('classify_segments', null),
    { ...reply('classify_segments'), stop_reason: 'max_tokens' },
  ])('an unusable billed reply fails and records spend', async response => {
    const { service } = setup('claude-fable-5-1', response);
    await expect(service.classifySegments({ segments })).rejects.toThrow();
    const records = vi.mocked(UsageRecordService.createUsageRecord).mock.calls;
    expect(records).toHaveLength(1);
    expect(records[0][3]).toMatchObject({ success: false, promptTokens: 900, completionTokens: 100 });
    expect(records[0][3].totalCost).toBeCloseTo(0.014);
  });
});
