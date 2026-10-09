// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { encoding_for_model } from 'tiktoken';

/**
 * The encoding every token estimate uses, for every provider.
 *
 * This was written at four sites as
 *
 *   config.model?.startsWith('gpt-') ? 'gpt-4o-mini' : 'gpt-4o-mini'
 *
 * — a ternary whose branches are the same string, so the test could not
 * change the result. Per-provider encoding was plainly intended and collapsed
 * at some point, invisibly, because nothing downstream looks wrong at a
 * glance.
 *
 * Keeping a single encoding is a decision, not a surrender to the bug.
 * tiktoken ships no encoding for Claude or Gemini, so there is nothing more
 * accurate to switch to locally, and asking it for a real per-model name
 * would throw for any id it does not recognise and drop the caller into the
 * far cruder `length / 4` fallback further down. `gpt-4o-mini` resolves to
 * `o200k_base`, which is also the correct encoding for the GPT-5 family FEED
 * actually runs.
 *
 * This comment used to say the bias was Anthropic's, at roughly 30%, citing
 * documentation. Measured on 2026-09-13 — one prompt of 143 estimated tokens,
 * sent to six models, each provider's own reported count:
 *
 *   Google   gemini-3.x            146   -2%
 *   Anthropic claude-haiku-4.5     163  -12%
 *   OpenAI   gpt-5.6 / gpt-6       189  -24%
 *   Anthropic claude-opus-5 / fable 245  -42%
 *
 * So the old figure was too high for one Claude generation and less than half
 * the truth for the other. More to the point, OpenAI is 24% low — and this
 * *is* OpenAI's tokenizer, so most of that gap cannot be encoding at all. It
 * is request framing: role markers, message structure and per-model overhead
 * the provider counts and a bare `encode()` of the prompt text does not.
 *
 * The estimate is therefore closest for the provider whose tokenizer it does
 * not model (Google) and furthest for the newest Claude models. No single
 * factor corrects that, which is why none is applied: a fabricated constant
 * would replace a knowable error with an invented one.
 *
 * The bias is confined to *estimates*: pre-flight limit checks and the cost
 * forecast. Every provider returns authoritative counts alongside its
 * response, and recorded spend is priced from those.
 */
export const ENCODING_MODEL = 'gpt-4o-mini' as const;
import prisma from '../../db';

/**
 * The stand-in prompt, for callers that cannot know the real one.
 *
 * Every translation is preceded by a limit check priced from an estimate, and
 * that estimate used to measure *this sentence* — always, for every request —
 * while the prompt actually sent was built further down by `PromptBuilder`
 * from the active `SystemPrompt` row. The two had no relationship beyond
 * resembling each other.
 *
 * Measured against this deployment's own rows, with a four-token input:
 *
 *   this sentence                          41 tokens
 *   FOOD_TRANSLATION  "Food Items and…"   143 tokens   3.49x
 *   BATCH_TRANSLATION "DOCX - Low Temp"   114 tokens   2.78x
 *   CUSTOM_TRANSLATION (no row, defaults)  51 tokens   1.24x
 *
 * Note that the error is not a constant to be corrected with a factor: it
 * scales with how much an administrator has written into the prompt row, so
 * the only estimate that tracks it is the prompt itself. Callers that have the
 * real prompt now pass it.
 *
 * This remains for the one caller that genuinely cannot: `rateLimiter` runs
 * per-IP on ten import routes before any configuration is resolved, and only
 * reads `.tokenCount` for throttling. A rough number is the right answer
 * there, and it is honest about being one.
 */
export function approximateSystemPrompt(targetLanguage: string): string {
  return `You are a translation service for a nonprofit food pantry. Translate to ${targetLanguage} using the closest natural equivalent. Your response must be a valid JSON string containing only a "translatedText" field.`;
}

export interface TokenMetrics {
  tokenCount: number;
  cost: number;
}

// Token calculation cache
interface CachedTokenMetrics {
  metrics: TokenMetrics;
  timestamp: number;
}

const TOKEN_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const tokenCache = new Map<string, CachedTokenMetrics>();
let cachedConfig: any = null;
let configCacheTime = 0;
const CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Converts cost rate to per-token rate based on unit price
 */
export function convertToPerTokenRate(rate: number, unitPrice?: string | null): number {
  if (!rate) return 0;
  
  switch (unitPrice) {
    case 'per_1m':
      return rate / 1_000_000;
    case 'per_1k':
      return rate / 1_000;
    default:
      // Default to per_1k for backward compatibility
      return rate / 1_000;
  }
}

/**
 * Clear token calculation cache
 */
export function clearTokenCache(): void {
  tokenCache.clear();
  cachedConfig = null;
  configCacheTime = 0;
}

/**
 * Create cache key for token calculations
 */
function createCacheKey(text: string, language?: string, operation?: string, systemPrompt?: string): string {
  // The prompt belongs in the key. Two configurations translating the same
  // string to the same language now legitimately produce different counts,
  // and without this the first one to run would answer for both.
  const content = `${text}:${language || ''}:${operation || 'default'}:${systemPrompt || ''}`;
  // Use simple hash for cache key
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString();
}

/**
 * Calculates input metrics using database configuration with caching
 */
export function calculateInputMetrics(
  userText: string, 
  targetLanguage: string,
  config: any,
  systemPrompt?: string
): TokenMetrics {
  const cacheKey = createCacheKey(userText, targetLanguage, 'input', systemPrompt);
  const cached = tokenCache.get(cacheKey);
  const now = Date.now();
  
  if (cached && (now - cached.timestamp) < TOKEN_CACHE_TTL) {
    return cached.metrics;
  }
  
  if (!config) {
    throw new Error('AI configuration required for token calculation.');
  }

  const promptText = systemPrompt ?? approximateSystemPrompt(targetLanguage);

  // Skip token calculation for very small texts (optimization).
  //
  // The shortcut books the system prompt at a flat 50 tokens, which is only
  // defensible while the prompt is a guess anyway. Once the caller has handed
  // over the real one, approximating its size would throw away the entire
  // point of passing it — a 143-token prompt would still be booked at 50 — so
  // the shortcut now applies only to the callers that cannot supply it.
  if (userText.length < 10 && systemPrompt === undefined) {
    const fallbackTokens = 5 + 50; // Small text + system prompt
    const inputCostPerToken = convertToPerTokenRate(config.inputCost || 0, config.unitPrice);
    const cost = fallbackTokens * inputCostPerToken;
    const result = { tokenCount: fallbackTokens, cost };
    
    tokenCache.set(cacheKey, {
      metrics: result,
      timestamp: now
    });
    
    return result;
  }

  const modelForEncoding = ENCODING_MODEL;
  
  try {
    const encoder = encoding_for_model(modelForEncoding);
    
    // The prompt that will actually be sent, when the caller knows it.
    const systemTokenCount = encoder.encode(promptText).length;
    
    // User text calculation
    const userTokenCount = encoder.encode(userText).length;
    
    encoder.free();
    
    const totalInputTokens = systemTokenCount + userTokenCount;
    const inputCostPerToken = convertToPerTokenRate(config.inputCost || 0, config.unitPrice);
    const cost = totalInputTokens * inputCostPerToken;
    
    const result = { tokenCount: totalInputTokens, cost };
    
    // Cache the result
    tokenCache.set(cacheKey, {
      metrics: result,
      timestamp: now
    });
    
    return result;
  } catch (error) {
    console.error('Token encoding error:', error);
    
    // Fallback calculation: ~4 chars per token, over prompt and text alike,
    // rather than a flat 50 for a prompt whose length we are holding.
    const roughTokens = Math.ceil((promptText.length + userText.length) / 4);
    const inputCostPerToken = convertToPerTokenRate(config.inputCost || 0, config.unitPrice);
    const cost = roughTokens * inputCostPerToken;
    
    const result = { tokenCount: roughTokens, cost };
    
    // Cache fallback result too
    tokenCache.set(cacheKey, {
      metrics: result,
      timestamp: now
    });
    
    return result;
  }
}

/**
 * Calculates output metrics using database configuration
 */
export function calculateOutputMetrics(outputText: string, config: any): TokenMetrics {
  if (!config) {
    throw new Error('AI configuration required for token calculation.');
  }

  const modelForEncoding = ENCODING_MODEL;
  
  try {
    const encoder = encoding_for_model(modelForEncoding);
    const outputTokenCount = encoder.encode(outputText).length;
    encoder.free();
    
    const outputCostPerToken = convertToPerTokenRate(config.outputCost || 0, config.unitPrice);
    const cost = outputTokenCount * outputCostPerToken;
    return { tokenCount: outputTokenCount, cost };
  } catch (error) {
    console.error('Token encoding error:', error);
    
    // Fallback calculation
    const roughTokens = Math.ceil(outputText.length / 4);
    const outputCostPerToken = convertToPerTokenRate(config.outputCost || 0, config.unitPrice);
    const cost = roughTokens * outputCostPerToken;
    
    return { tokenCount: roughTokens, cost };
  }
}

/**
 * Estimates output metrics for translations (1.5x input text)
 */
export function estimateOutputMetrics(inputText: string, config: any): TokenMetrics {
  if (!config) {
    throw new Error('AI configuration required for token calculation.');
  }

  const modelForEncoding = ENCODING_MODEL;
  
  try {
    const encoder = encoding_for_model(modelForEncoding);
    const inputTokenCount = encoder.encode(inputText).length;
    encoder.free();
    
    const estimatedOutputTokens = Math.ceil(inputTokenCount * 1.5);
    const outputCostPerToken = convertToPerTokenRate(config.outputCost || 0, config.unitPrice);
    const cost = estimatedOutputTokens * outputCostPerToken;
    
    return { tokenCount: estimatedOutputTokens, cost };
  } catch (error) {
    console.error('Token encoding error:', error);
    
    // Fallback calculation
    const roughInputTokens = Math.ceil(inputText.length / 4);
    const estimatedOutputTokens = Math.ceil(roughInputTokens * 1.5);
    const outputCostPerToken = convertToPerTokenRate(config.outputCost || 0, config.unitPrice);
    const cost = estimatedOutputTokens * outputCostPerToken;
    
    return { tokenCount: estimatedOutputTokens, cost };
  }
}

/**
 * Formats a token count for display
 */
export function formatTokenCount(count: number): string {
  return count.toLocaleString();
}

/**
 * Formats a cost amount for display
 */
export function formatCost(cost: number): string {
  return `$${cost.toFixed(6)}`;
}
