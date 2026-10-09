// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * The catalogue hook the configuration dialogs read instead of a second copy
 * of the model list (ISSUES.md #84).
 *
 * The behaviour worth pinning is what happens when the request does not
 * succeed. `ServiceStep` renders inside the wizard, and the wizard's own tests
 * click straight through it — so a failed or pending fetch has to leave an
 * empty list and a settled `isLoading`, never a thrown error or a permanent
 * loading state that would gate navigation on the network.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { MockedClass } from 'vitest';

import { useModelCatalogue } from './useModelCatalogue';
import { AIConfigService } from '@/services/ai-config';
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';
import type { CatalogueModel } from '@/components/ai-configuration/types';

vi.mock('@/services/ai-config');
vi.mock('@/services/error/ErrorHandlerService');

const haiku = {
  id: 'claude-haiku-4-5-20251001',
  displayName: 'claude-haiku-4.5',
  provider: 'Anthropic',
  pricing: { input: 1, output: 5, verifiedAt: '2026-09-11' },
  contextWindow: 200000,
  maxOutputTokens: 64000,
  lifecycle: { status: 'active' },
  costTier: 'economy',
  capabilities: {
    sampling: 'temperature-or-top-p',
    maxTokensField: 'max_tokens',
    reasoning: { kind: 'extended', leastCost: 'off' },
    prefill: 'allowed'
  },
  rateLimits: { tokensPerMinute: 10000, requestsPerMinute: 50 }
} as unknown as CatalogueModel;

const catalogue = {
  models: [haiku],
  endpoints: { Anthropic: 'https://api.anthropic.com/v1' }
};

describe('useModelCatalogue', () => {
  let handleErrorSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    handleErrorSpy = vi.spyOn(ErrorHandlerService, 'handleError');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches the catalogue on mount', async () => {
    const mocked = AIConfigService as MockedClass<typeof AIConfigService>;
    mocked.prototype.getModels.mockResolvedValue(catalogue);

    const { result } = renderHook(() => useModelCatalogue());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.models).toEqual([haiku]);
    expect(result.current.endpoints).toEqual(catalogue.endpoints);
    expect(handleErrorSpy).not.toHaveBeenCalled();
  });

  it('leaves an empty list and settles when the request fails', async () => {
    // The important half: a caller that gates on `isLoading` must not wait
    // forever, and one that maps over `models` must not see undefined.
    const error = new Error('Failed to fetch');
    const mocked = AIConfigService as MockedClass<typeof AIConfigService>;
    mocked.prototype.getModels.mockRejectedValue(error);

    const { result } = renderHook(() => useModelCatalogue());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.models).toEqual([]);
    expect(result.current.endpoints).toEqual({});
    expect(handleErrorSpy).toHaveBeenCalledWith(error, 'fetchModelCatalogue');
  });

  it('tolerates a response missing its fields', async () => {
    // A proxy or an older server can answer 200 with something else entirely.
    const mocked = AIConfigService as MockedClass<typeof AIConfigService>;
    mocked.prototype.getModels.mockResolvedValue({} as never);

    const { result } = renderHook(() => useModelCatalogue());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.models).toEqual([]);
    expect(result.current.endpoints).toEqual({});
  });

  it('refetches on refresh', async () => {
    const mocked = AIConfigService as MockedClass<typeof AIConfigService>;
    mocked.prototype.getModels.mockResolvedValue(catalogue);

    const { result } = renderHook(() => useModelCatalogue());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.refresh();
    });

    expect(mocked.prototype.getModels).toHaveBeenCalledTimes(2);
  });
});
