// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import config from '@/config/config';

export interface TokenMetrics {
  tokenCount: number;
  cost: number;
}

interface TokenEstimationResult {
  inputMetrics: TokenMetrics;
  outputMetrics: TokenMetrics;
  totalCost: number;
  model?: string;
  warning?: string;
}

/**
 * Estimates tokens and cost for both input and output using backend API
 */
export const estimateTokens = async (text: string, targetLanguage?: string): Promise<TokenEstimationResult> => {
  try {
    const response = await fetch(`${config.api.baseUrl}/api/ai-config/estimate-tokens`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        targetLanguage: targetLanguage || 'Custom'
      })
    });

    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = `${import.meta.env.BASE_URL}login`;
        throw new Error('Authentication required');
      }
      
      const errorText = await response.text();
      let errorMessage;
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData?.error?.message || errorData?.message || 'Token estimation failed';
      } catch {
        errorMessage = errorText || 'Token estimation failed';
      }
      throw new Error(errorMessage);
    }

    return await response.json();
  } catch (error) {
    console.error('Error estimating tokens:', error);
    // Return conservative fallback estimates
    return {
      inputMetrics: {
        tokenCount: Math.ceil(text.length / 4) + 50, // Rough estimate + system prompt
        cost: 0
      },
      outputMetrics: {
        tokenCount: Math.ceil((text.length / 4) * 1.5),
        cost: 0
      },
      totalCost: 0,
      warning: 'Using fallback estimation due to API error'
    };
  }
};

/**
 * Formats cost for display
 */
export const formatCost = (cost: number): string => {
  return `$${cost.toFixed(4)}`;
}

/**
 * Formats token count for display
 */
export const formatTokenCount = (count: number): string => {
  return count.toLocaleString();
}
