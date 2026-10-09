// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Builder translation service.
 *
 * Bridges Shopping List Builder templates and the existing AI translation
 * primitive. Templates contain user-typed strings (text-component content
 * today; form-field labels, section-table titles, etc. in future slices)
 * that need to render in a client's preferred language. This service:
 *
 *   1. Reads the `Translation` cache table for `type = 'Generated (List)'`
 *      entries matching the requested strings + language, and reports which
 *      are present vs. missing (used by the modal's pre-flight step).
 *   2. Calls the same `AITranslationService.translateTextBatch` primitive
 *      that `translation-trigger.ts` and `DocxTranslationService` use to
 *      fill in missing translations, writes results back to the cache as
 *      `'Generated (List)'` rows, and returns a complete
 *      Record<originalText, translatedText> so the renderer can swap
 *      strings in-place.
 *
 * Mirrors the conventions established by `translation-trigger.ts`:
 *   - Uses `AIServiceFactory.createService()` for the AI provider.
 *   - Uses `translateBatchWithFallback` for truncation-resilient batches.
 *   - Writes `pending` rows before the AI call and `completed` rows after.
 *   - Uses the `translation_unique_combo` (originalText, language, type)
 *     compound unique key.
 *
 * Translation Management UI surfaces the new `'Generated (List)'` type
 * alongside the existing `'Custom'` / `'Generated'` / `'FoodItem'` /
 * `'Category'` entries so staff can curate the cache the same way they
 * already do for those types.
 */

import { AIServiceFactory } from './ai/factory/AIServiceFactory';
import { alertService } from './alerts';
import prisma from '../db';
import type { BatchTranslationResult } from './ai/base/AITranslationService';

/**
 * Translation `type` value reserved for Shopping List Builder template
 * strings. Distinct from `'Generated'` (which is used for full DOCX
 * documents) so the two streams can be filtered / curated independently.
 */
export const BUILDER_TRANSLATION_TYPE = 'Generated (List)';

/**
 * Maximum strings sent in a single AI call. Builder templates rarely
 * contain more than a handful of text components, so this is generous
 * for v1; matches the `'Custom'` content type batch size used by
 * `translation-trigger.ts`.
 */
const BUILDER_TRANSLATION_BATCH_SIZE = 15;

const isTruncationError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes('max_tokens') || message.includes('truncated');
};

/**
 * How a translation attempt failed, from the caller's point of view.
 *
 * The distinction that matters to a user is not which provider broke but
 * whether retrying can possibly work. `busy` clears on its own in a minute;
 * `exhausted` and `misconfigured` never clear until somebody pays a bill,
 * changes a key, or picks a different model. Telling staff to "wait about a
 * minute" for those two is worse than saying nothing -- they retry the whole
 * nine-language export until they give up. See ISSUES.md #80.
 *
 * The classifier and its marker lists now live in
 * `services/ai/provider-failure.ts`, where the translation and document
 * routes can read a provider's refusal the same way (ISSUES.md #84). They are
 * re-exported here so every existing caller and test keeps working against
 * this module.
 */
export type { TranslationProviderFailure } from './ai/provider-failure';
export { classifyTranslationProviderError } from './ai/provider-failure';

const translateBatchWithFallback = async (
  items: Array<{ id: string; text: string }>,
  translate: (
    items: Array<{ id: string; text: string }>,
  ) => Promise<BatchTranslationResult>,
  shouldSplit: (error: unknown) => boolean,
): Promise<BatchTranslationResult[]> => {
  try {
    const result = await translate(items);
    return [result];
  } catch (error) {
    if (!shouldSplit(error) || items.length <= 1) {
      throw error;
    }
    const midpoint = Math.ceil(items.length / 2);
    const first = items.slice(0, midpoint);
    const second = items.slice(midpoint);
    const firstResults = await translateBatchWithFallback(first, translate, shouldSplit);
    const secondResults = await translateBatchWithFallback(second, translate, shouldSplit);
    return [...firstResults, ...secondResults];
  }
};

const chunk = <T>(items: T[], size: number): T[][] => {
  if (size <= 0) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
};

/**
 * Normalize raw template strings into the deduplicated set we will actually
 * query or translate. Empty / whitespace-only entries are dropped so we do
 * not waste AI calls on them and so the cache stays free of empty rows.
 */
const normalizeStrings = (strings: readonly string[]): string[] => {
  const seen = new Set<string>();
  for (const raw of strings) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (!seen.has(raw)) seen.add(raw);
  }
  return Array.from(seen);
};

export interface BuilderTranslationLookup {
  /** Translated text keyed by original (cache hits only). */
  cached: Record<string, string>;
  /** Original strings that had no completed cache entry. */
  missing: string[];
}

/**
 * Look up cached `'Generated (List)'` translations for the given strings in
 * the given language. Strings are de-duplicated and trimmed-blank entries
 * are skipped. Only rows with `status === 'completed'` count as cached;
 * `pending` and `failed` rows are reported as missing so the caller can
 * re-translate them.
 */
export async function lookupBuilderTranslations(
  strings: readonly string[],
  language: string,
): Promise<BuilderTranslationLookup> {
  const candidates = normalizeStrings(strings);
  if (candidates.length === 0 || !language) {
    return { cached: {}, missing: [] };
  }

  const rows = await prisma.translation.findMany({
    where: {
      originalText: { in: candidates },
      language,
      type: BUILDER_TRANSLATION_TYPE,
      status: 'completed',
    },
    select: { originalText: true, translatedText: true },
  });

  const cached: Record<string, string> = {};
  for (const row of rows) {
    if (typeof row.translatedText === 'string' && row.translatedText.length > 0) {
      cached[row.originalText] = row.translatedText;
    }
  }

  const missing = candidates.filter((s) => !(s in cached));
  return { cached, missing };
}

/**
 * Translate a batch of builder strings into the given language, populating
 * the `Translation` cache with `type = 'Generated (List)'` rows. Returns a
 * complete map of `originalText -> translatedText` for every input string,
 * combining cache hits with freshly translated entries.
 *
 * Behaviour:
 *   - Cache hits are returned as-is (no AI call for those).
 *   - Missing strings are upserted to `pending`, sent to the AI provider in
 *     chunks of {@link BUILDER_TRANSLATION_BATCH_SIZE}, and updated to
 *     `completed` on success. Any string the provider fails to translate is
 *     flipped to `failed` and omitted from the returned map so the caller
 *     can decide how to fall back (the builder renderer falls back to the
 *     original English text).
 *   - Each AI batch's metrics (`promptTokens`, `completionTokens`,
 *     `totalCost`, `duration`) are distributed across the rows returned by
 *     that call and persisted on the `Translation` row so the
 *     daily-aggregate alert path in `AlertService.checkTokenUsage` /
 *     `checkCostUsage` sees builder traffic (mirrors `docx/translation.ts`).
 *     Threshold + response-time alert checks fire after each batch.
 *   - Throws if the AI provider call itself fails (network / config errors).
 */
export async function translateBuilderStrings(
  strings: readonly string[],
  language: string,
): Promise<Record<string, string>> {
  const candidates = normalizeStrings(strings);
  if (candidates.length === 0 || !language) {
    return {};
  }

  const { cached, missing } = await lookupBuilderTranslations(candidates, language);
  if (missing.length === 0) {
    return cached;
  }

  // Upsert pending rows so concurrent callers see in-flight state and so we
  // have stable `id` values to round-trip through the AI batch response.
  const pendingByText = new Map<string, number>();
  for (const text of missing) {
    const row = await prisma.translation.upsert({
      where: {
        translation_unique_combo: {
          originalText: text,
          language,
          type: BUILDER_TRANSLATION_TYPE,
        },
      },
      create: {
        originalText: text,
        language,
        type: BUILDER_TRANSLATION_TYPE,
        status: 'pending',
      },
      update: {
        status: 'pending',
        translatedText: null,
      },
    });
    pendingByText.set(text, row.id);
  }

  const requestItems: Array<{ id: string; text: string }> = missing.map((text) => ({
    id: String(pendingByText.get(text)),
    text,
  }));

  const aiService = await AIServiceFactory.createService();

  const idToText = new Map<number, string>();
  for (const [text, id] of pendingByText.entries()) {
    idToText.set(id, text);
  }

  const freshlyTranslated: Record<string, string> = {};
  const successfullyHandledIds = new Set<number>();

  // Chunk to keep individual AI calls within provider limits; rely on
  // translateBatchWithFallback to halve any chunk that still trips a
  // max-tokens / truncation error. Each `BatchTranslationResult` (whether
  // from a chunk or a fallback split) is processed independently so its
  // metrics distribute onto the rows it returned, and so daily alert
  // checks fire at the same per-batch granularity as docx/translation.ts.
  for (const slice of chunk(requestItems, BUILDER_TRANSLATION_BATCH_SIZE)) {
    const batchResults = await translateBatchWithFallback(
      slice,
      (items) =>
        aiService.translateTextBatch({
          texts: items,
          targetLanguage: language,
          context: 'custom',
        }),
      isTruncationError,
    );

    for (const result of batchResults) {
      // Distribute the batch's metrics across the rows returned by this AI
      // call so `Translation.promptTokens` / `completionTokens` /
      // `totalCost` (read by `AlertService.checkTokenUsage` /
      // `checkCostUsage`) reflect builder traffic. Mirrors
      // docx/translation.ts:1297-1308. Result.metrics is non-optional in
      // the contract but defaulted here so test mocks can omit it.
      const returnedCount = result.translations.length;
      const metrics = result.metrics ?? {
        duration: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalCost: 0,
      };
      const perRowPromptTokens = returnedCount > 0
        ? Math.ceil(metrics.promptTokens / returnedCount)
        : 0;
      const perRowCompletionTokens = returnedCount > 0
        ? Math.ceil(metrics.completionTokens / returnedCount)
        : 0;
      const perRowTotalCost = returnedCount > 0
        ? metrics.totalCost / returnedCount
        : 0;

      for (const translation of result.translations) {
        const id = Number(translation.id);
        if (!Number.isFinite(id)) continue;
        const originalText = idToText.get(id);
        if (!originalText) continue;
        const translatedText = translation.translatedText;
        if (typeof translatedText !== 'string' || translatedText.length === 0) {
          continue;
        }

        await prisma.translation.update({
          where: { id },
          data: {
            translatedText,
            status: 'completed',
            promptTokens: perRowPromptTokens,
            completionTokens: perRowCompletionTokens,
            totalCost: perRowTotalCost,
          },
        });
        freshlyTranslated[originalText] = translatedText;
        successfullyHandledIds.add(id);
      }

      // Response-time alerting is non-blocking: alert failures must not break
      // the translation operation. Spend is enforced from this request's
      // active AI configuration before the provider call.
      try {
        await alertService.checkResponseTime(metrics.duration);
      } catch (alertError) {
        console.warn('Builder translation alert check failed:', alertError);
      }
    }
  }

  // Mark any pending rows the provider did not return as `failed` so they
  // do not stay stuck in `pending` forever and so the next call surfaces
  // them as missing.
  const failedIds = Array.from(pendingByText.values()).filter(
    (id) => !successfullyHandledIds.has(id),
  );
  if (failedIds.length > 0) {
    await prisma.translation.updateMany({
      where: { id: { in: failedIds } },
      data: { status: 'failed' },
    });
  }

  return { ...cached, ...freshlyTranslated };
}
