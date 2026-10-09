// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useState, useCallback, useEffect } from 'react';
import { estimateTokens, TokenMetrics } from '@/utils/token-utils';
import { useDebounce } from '../use-debounce';

export interface TokenEstimationResult {
  inputMetrics: TokenMetrics;
  outputMetrics: TokenMetrics;
  totalCost: number;
  isLoading: boolean;
  error: string | null;
}

export const useTokenEstimation = (text: string) => {
  const [metrics, setMetrics] = useState<Omit<TokenEstimationResult, 'isLoading' | 'error'>>({    
    inputMetrics: { tokenCount: 0, cost: 0 },
    outputMetrics: { tokenCount: 0, cost: 0 },
    totalCost: 0
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce text to avoid too frequent updates
  const debouncedText = useDebounce(text, 500);

  const calculateMetrics = useCallback(async () => {
    if (!debouncedText.trim()) {
      setMetrics({
        inputMetrics: { tokenCount: 0, cost: 0 },
        outputMetrics: { tokenCount: 0, cost: 0 },
        totalCost: 0
      });
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await estimateTokens(debouncedText);
      setMetrics({
        inputMetrics: result.inputMetrics,
        outputMetrics: result.outputMetrics,
        totalCost: result.totalCost
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error estimating tokens');
      console.error('Token estimation error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [debouncedText]);

  useEffect(() => {
    calculateMetrics();
  }, [calculateMetrics]);

  return {
    ...metrics,
    isLoading,
    error
  };
};