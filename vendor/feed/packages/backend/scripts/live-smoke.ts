// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * The live smoke sweep: seven requests per model, against real providers.
 *
 * This is test layer 6 from `docs/ai-config/model-catalogue-refresh-2026-09.md`
 * — the one layer that costs money, and the only one that can prove a model
 * contract rather than FEED's handling of a fixture. It is opt-in, never run
 * in CI, and refuses to spend anything without `--bill`.
 *
 * ## Why it exists rather than driving FEED's own interface
 *
 * All three translation call sites ask `AIServiceFactory.createService()` with
 * no argument, which resolves one configuration — `findFirst({ type:'apikey',
 * isActive:true, deletedAt:null }, orderBy:{ updatedAt:'desc' })` — across
 * every provider. Activating a model therefore does not make it reachable,
 * and several models cannot be exercised through the interface at all
 * (ISSUES.md #84). This script calls `createServiceFromConfiguration`, which
 * builds an uncached service for exactly the row you name.
 *
 * ## What it leaves behind
 *
 * Real spend, recorded. Every provider service extends `AITranslationService`,
 * whose `trackUsage` writes a `UsageRecord` against `config.id`, so a request
 * from this script is accounted exactly like one from a route and shows up in
 * the usage dashboard under that configuration. That is deliberate: a sweep
 * whose cost vanished would be a worse test.
 *
 * ## Keys
 *
 * This script never decrypts, prints, or fingerprints an API key. Providers
 * decrypt their own through FEED's `decryptApiKey`. The one place a key is
 * constructed is request 6, which encrypts a deliberately invalid string
 * through FEED's own `encryptApiKey` so the *provider* is what rejects it —
 * testing the refusal path rather than the encryption layer.
 *
 * ## Usage
 *
 *   ts-node scripts/live-smoke.ts                      # plan only, no network
 *   ts-node scripts/live-smoke.ts --unbilled           # free lookups only
 *   ts-node scripts/live-smoke.ts --bill               # the full sweep
 *   ts-node scripts/live-smoke.ts --bill --provider Google
 *   ts-node scripts/live-smoke.ts --bill --config 9
 *   ts-node scripts/live-smoke.ts --bill --include-frontier --ceiling 2.00
 *
 * Frontier models are skipped unless `--include-frontier`. Every request is
 * capped at `SWEEP_OUTPUT_CAP` output tokens. The input estimate is not a
 * guarantee. A conservative reservation is checked before each billable call;
 * persisted spend includes failed replies and unknown prices are refused.
 */

import type { AIConfiguration } from '@prisma/client';

import prisma from '../src/db';
import { UsageRecordService } from '../src/services/usage-record';
import { AIServiceFactory } from '../src/services/ai/factory/AIServiceFactory';
import type { AITranslationService } from '../src/services/ai/base/AITranslationService';
import { encryptApiKey } from '../src/services/encryption';
import { PromptBuilder } from '../src/services/ai/prompts/PromptBuilder';
import {
  acceptedReasoningValues,
  capabilitiesFor,
  findCatalogueEntry,
  hasReasoningControl,
  isCatalogueProvider,
} from '../src/services/ai/catalogue';
import {
  PROVIDER_FAILURE_CODES,
  classifyTranslationProviderError,
} from '../src/services/ai/provider-failure';

/**
 * The output ceiling this sweep imposes on every request it makes.
 *
 * Without it, the figure printed before a run is a guess wearing a bound's
 * clothing. FEED resolves a request's output cap through `PromptBuilder`,
 * which reads `config.maxTokens ?? 4096`, and this deployment's rows carry
 * 64,000 to 128,000. Anthropic's `resolveMaxTokens` clamps that to 20,480 for
 * a translation; OpenAI and Google pass it straight through. So one
 * `gpt-6-astra` request that ran to its cap would be 128,000 x $50/1M =
 * $6.40, and the twelve-model sweep's true worst case was about $55 against
 * an expected $0.46. Two orders of magnitude of daylight is not a budget.
 *
 * Setting `maxTokens` on the configuration the sweep uses closes it: the
 * value flows through `PromptBuilder` into all three providers, and no
 * request can emit more than this many output tokens. 512 is ample for a
 * one-sentence translation — the longest completion measured anywhere in this
 * catalogue was 262 tokens, on `gemini-3.1-pro-preview` at `low`.
 *
 * What it costs: request 4 no longer measures *unbounded* reasoning, only
 * that the highest level is accepted and answers inside 512 tokens. That is
 * the honest trade, and the run says so in its own output rather than
 * quietly reporting a smaller number.
 */
const SWEEP_OUTPUT_CAP = 512;

/**
 * The input size the projection assumes — assumed, not enforced.
 *
 * This read 250, from the refresh document's measurement of a one-sentence
 * translation, and the sweep that was meant to justify it falsified it on its
 * first run: observed prompt sizes ranged 133 to 977 tokens, the top three
 * being `classifySegmentsBatch` at 909, 954 and 977. Classification sends
 * every segment plus a tool schema, so it is nothing like a one-sentence
 * translation, and 250 was low by 3.9x.
 *
 * 1,024 sits above every figure this deployment has produced. It is still an
 * assumption: `SWEEP_OUTPUT_CAP` is enforced through `maxTokens`, but nothing
 * caps input, which is the resolved `SystemPrompt` row plus the fixed strings
 * below. A larger prompt row moves it. Making it a real bound would mean
 * resolving the prompt through `PromptBuilder` and measuring it before the
 * run, which is worth doing and is not done here.
 */
const ASSUMED_INPUT_TOKENS = 1_024;
const BILLABLE_REQUESTS = 4;

const DEFAULT_CEILING_USD = 1.0;

type RequestOutcome = {
  model: string;
  configId: number;
  request: string;
  billable: boolean;
  ok: boolean;
  detail: string;
  ms: number;
  promptTokens?: number;
  completionTokens?: number;
  costUsd?: number;
};

interface Options {
  bill: boolean;
  unbilledOnly: boolean;
  includeFrontier: boolean;
  provider?: string;
  configId?: number;
  ceiling: number;
}

export const parseArgs = (argv: string[]): Options => {
  const value = (flag: string): string | undefined => {
    const at = argv.indexOf(flag);
    return at === -1 ? undefined : argv[at + 1];
  };

  const ceilingRaw = value('--ceiling');
  const configRaw = value('--config');

  if (ceilingRaw !== undefined && (!Number.isFinite(Number(ceilingRaw)) || Number(ceilingRaw) <= 0)) {
    throw new Error('--ceiling must be a positive finite dollar amount.');
  }
  if (argv.includes('--ceiling') && ceilingRaw === undefined) throw new Error('--ceiling requires a dollar amount.');
  if (argv.includes('--config') && (!configRaw || !Number.isSafeInteger(Number(configRaw)) || Number(configRaw) <= 0)) {
    throw new Error('--config requires a positive integer ID.');
  }
  if (argv.includes('--bill') && argv.includes('--unbilled')) throw new Error('Choose --bill or --unbilled, not both.');

  return {
    bill: argv.includes('--bill'),
    unbilledOnly: argv.includes('--unbilled'),
    includeFrontier: argv.includes('--include-frontier'),
    provider: value('--provider'),
    configId: configRaw ? Number(configRaw) : undefined,
    ceiling: ceilingRaw ? Number(ceilingRaw) : DEFAULT_CEILING_USD,
  };
};

/**
 * The configurations this run will touch: live rows only.
 *
 * Soft-deleted rows are excluded here even though the usage dashboard now
 * shows them — the dashboard reports history that already happened, while
 * this spends money, and spending it against a configuration an administrator
 * has deleted would be indefensible.
 */
const selectConfigurations = async (options: Options): Promise<AIConfiguration[]> => {
  const configs = await prisma.aIConfiguration.findMany({
    where: {
      type: 'apikey',
      deletedAt: null,
      ...(options.configId ? { id: options.configId } : {}),
      ...(options.provider ? { serviceType: options.provider } : {}),
    },
    orderBy: [{ serviceType: 'asc' }, { id: 'asc' }],
  });

  return configs.filter((config) => {
    if (!config.model || !isCatalogueProvider(config.serviceType)) return false;
    if (options.includeFrontier) return true;
    const entry = findCatalogueEntry(config.model);
    return entry?.costTier !== 'frontier';
  });
};

/**
 * What one model's four billable requests should cost — half bound, half
 * assumption, and the halves are worth keeping straight.
 *
 * The **output** side is a real bound: every request carries
 * `SWEEP_OUTPUT_CAP` through `maxTokens`, so it cannot be exceeded however
 * long the model would like to think. Output is where the money is on a
 * frontier model, which is why capping it was the thing worth doing.
 *
 * The **input** side is assumed, at `ASSUMED_INPUT_TOKENS`, and nothing
 * enforces it. This comment used to call the whole figure "a bound rather
 * than an estimate" — wrong on the input half, and wrong in a way the sweep
 * had already disproved by the time it was written. See
 * `ASSUMED_INPUT_TOKENS`.
 *
 * So: a projection with an enforced ceiling on the expensive half, not a
 * guarantee. The sweep reserves three projected attempts before each call.
 */
export const projectedCost = (config: AIConfiguration): number | null => {
  const entry = findCatalogueEntry(config.model ?? '');
  if (!entry || entry.provider !== config.serviceType) return null;
  // Saved prices may be higher than the catalogue (including legacy per_1k
  // rows). Reserve at the higher rate while preserving actual recording.
  const multiplier = config.unitPrice === 'per_1k' ? 1000 : config.unitPrice === 'per_1m' ? 1 : null;
  if (multiplier === null || typeof config.inputCost !== 'number' || typeof config.outputCost !== 'number'
    || !Number.isFinite(config.inputCost) || !Number.isFinite(config.outputCost)
    || config.inputCost <= 0 || config.outputCost <= 0) return null;
  const inputPrice = Math.max(entry.pricing.input, config.inputCost * multiplier);
  const outputPrice = Math.max(entry.pricing.output, config.outputCost * multiplier);

  const inputTokens = ASSUMED_INPUT_TOKENS * BILLABLE_REQUESTS;
  const outputTokens = SWEEP_OUTPUT_CAP * BILLABLE_REQUESTS;

  return (inputTokens * inputPrice + outputTokens * outputPrice) / 1_000_000;
};

/**
 * The configuration this sweep actually sends: the saved row, capped.
 *
 * `PromptBuilder` caches its resolved configuration under `config.id`, and
 * every clone below reuses the original's id — so capping the *base* row, not
 * only the clones, is what makes the cap hold across all four billable
 * requests. `main` also clears that cache per configuration, so an uncapped
 * resolution cannot survive from an earlier one.
 */
const capped = (config: AIConfiguration): AIConfiguration =>
  ({ ...config, maxTokens: SWEEP_OUTPUT_CAP }) as AIConfiguration;

export const measureRequest = async <T>(work: () => Promise<T>) => {
  const started = Date.now();
  const { result, records } = await UsageRecordService.captureUsage(async () => {
    try {
      return { result: await work(), error: undefined as unknown };
    } catch (error) {
      return { result: undefined, error };
    }
  });
  return {
    ...result, ms: Date.now() - started,
    usage: records.reduce((sum, record) => ({
      promptTokens: sum.promptTokens + record.promptTokens,
      completionTokens: sum.completionTokens + record.completionTokens,
      totalCost: sum.totalCost + record.totalCost,
    }), { promptTokens: 0, completionTokens: 0, totalCost: 0 }),
  };
};
const time = measureRequest;

/**
 * Requests 5-7: the three that are expected to cost nothing.
 *
 * All three go through `checkAccess()`, which every provider implements as a
 * model lookup — `models.retrieve` on OpenAI and Anthropic, `models.get` on
 * Google. That the refusals are unbilled is the providers' expected
 * behaviour, not a guarantee; confirm it against the first run's invoice.
 */
const unbilledRequests = async (
  config: AIConfiguration,
  service: AITranslationService,
): Promise<RequestOutcome[]> => {
  const model = config.model ?? 'unknown';
  const outcomes: RequestOutcome[] = [];

  const access = await time(() => service.checkAccess());
  outcomes.push({
    model,
    configId: config.id,
    request: '5. availability (model lookup)',
    billable: false,
    ok: access.result?.ok === true,
    detail: access.result?.ok ? 'reachable' : describeFailure(access.result?.error ?? access.error),
    ms: access.ms,
  });

  // 6. A validly encrypted key that the provider will reject. Encrypting it
  //    through FEED's own encryptApiKey is what makes this a test of the
  //    refusal path rather than of the encryption layer.
  const { encrypted, salt } = await encryptApiKey('sk-feed-live-smoke-deliberately-invalid');
  const badKey = AIServiceFactory.createServiceFromConfiguration({
    ...config,
    encryptedApiKey: encrypted,
    salt,
  } as AIConfiguration);
  const rejected = await time(() => badKey.checkAccess());
  const rejectedFailure = rejected.result?.ok
    ? null
    : classifyTranslationProviderError(rejected.result?.error ?? rejected.error);
  outcomes.push({
    model,
    configId: config.id,
    request: '6. invalid key',
    billable: false,
    ok: rejectedFailure === 'misconfigured',
    detail: rejected.result?.ok
      ? 'ACCEPTED an invalid key — that is the finding'
      : `${rejectedFailure} / ${rejectedFailure ? PROVIDER_FAILURE_CODES[rejectedFailure] : '—'}`,
    ms: rejected.ms,
  });

  // 7. A model id this account cannot call. A non-existent id exercises the
  //    same 404-shaped refusal as a real model outside an account's
  //    allow-list, and the point being tested is that FEED's message names
  //    the model rather than blaming the key.
  const unavailableId = `${config.model}-not-entitled`;
  const badModel = AIServiceFactory.createServiceFromConfiguration({
    ...config,
    model: unavailableId,
  } as AIConfiguration);
  const refused = await time(() => badModel.checkAccess());
  const refusedFailure = refused.result?.ok
    ? null
    : classifyTranslationProviderError(refused.result?.error ?? refused.error);
  outcomes.push({
    model,
    configId: config.id,
    request: '7. unusable model id',
    billable: false,
    ok: refusedFailure === 'misconfigured',
    detail: refused.result?.ok
      ? `ACCEPTED ${unavailableId} — that is the finding`
      : `${refusedFailure} / names model: ${describeFailure(
          refused.result?.error ?? refused.error,
        ).includes(unavailableId)}`,
    ms: refused.ms,
  });

  return outcomes;
};

/** Requests 1-4: the billable half. */
const billableRequests = async (
  config: AIConfiguration,
  service: AITranslationService,
  budget: { ceiling: number; reserved: number; spent: number },
  outcomes: RequestOutcome[],
): Promise<RequestOutcome[]> => {
  const model = config.model ?? 'unknown';
  const projected = projectedCost(config);
  if (projected === null) throw new Error(`Cannot price ${model}; no billable request was sent.`);
  const measure = async <T>(work: () => Promise<T>) => {
    // Reserve a projected request including FEED's possible retries. Input remains
    // an estimate, so this is a stop policy, not a provider-side hard dollar cap.
    const reservation = projected / BILLABLE_REQUESTS * 3;
    if (budget.reserved + reservation > budget.ceiling) {
      throw new Error(`Sweep ceiling reached; ${usd(budget.spent)} recorded so far. No next request sent.`);
    }
    budget.reserved += reservation;
    const measured = await time(work);
    budget.spent += measured.usage.totalCost;
    budget.reserved += Math.max(0, measured.usage.totalCost - reservation);
    return measured;
  };

  const one = await measure(() =>
    service.translateText({
      text: 'Canned black beans, low sodium.',
      targetLanguage: 'Spanish',
      context: 'food',
    }),
  );
  outcomes.push({
    model,
    configId: config.id,
    request: '1. translateText',
    billable: true,
    ok: Boolean(one.result?.translatedText),
    detail: one.result?.translatedText ?? describeFailure(one.error),
    ms: one.ms,
    promptTokens: one.usage.promptTokens,
    completionTokens: one.usage.completionTokens,
    costUsd: one.usage.totalCost,
  });

  // Arabic, with a duplicate among the three, so this exercises RTL, the
  // de-duplication, and that results come back matched to their ids.
  const two = await measure(() =>
    service.translateTextBatch({
      texts: [
        { id: 'a', text: 'Rice' },
        { id: 'b', text: 'Canned tuna' },
        { id: 'c', text: 'Rice' },
      ],
      targetLanguage: 'Arabic',
      context: 'food',
    }),
  );
  const twoOk =
    two.result?.translations.length === 3
    && two.result.translations.every((t) => Boolean(t.translatedText));
  outcomes.push({
    model,
    configId: config.id,
    request: '2. translateTextBatch (ar)',
    billable: true,
    ok: Boolean(twoOk),
    detail: twoOk
      ? two.result!.translations.map((t) => `${t.id}=${t.translatedText}`).join(' | ')
      : describeFailure(two.error),
    ms: two.ms,
    promptTokens: two.usage.promptTokens,
    completionTokens: two.usage.completionTokens,
    costUsd: two.usage.totalCost,
  });

  const three = await measure(() =>
    service.classifySegmentsBatch({
      segments: [
        { id: 's1', text: 'Food Pantry Hours' },
        { id: 's2', text: '12345' },
        { id: 's3', text: 'Please bring identification.' },
      ],
    }),
  );
  outcomes.push({
    model,
    configId: config.id,
    request: '3. classifySegmentsBatch',
    billable: true,
    ok: three.result?.classifications.length === 3,
    detail:
      three.result?.classifications
        .map((c) => `${c.id}:a=${c.a.toFixed(2)},b=${c.b.toFixed(2)}`)
        .join(' | ') ?? describeFailure(three.error),
    ms: three.ms,
    promptTokens: three.usage.promptTokens,
    completionTokens: three.usage.completionTokens,
    costUsd: three.usage.totalCost,
  });

  // 4. The highest reasoning level the model accepts. Models whose thinking
  //    is not a selectable level — Claude's extended thinking, and models with
  //    no control at all — have nothing to raise, so this is skipped rather
  //    than faked with a value the provider would refuse.
  const capabilities = capabilitiesFor(
    config.serviceType as 'OpenAI' | 'Anthropic' | 'Google',
    config.model!,
  );
  if (!hasReasoningControl(capabilities)) {
    outcomes.push({
      model,
      configId: config.id,
      request: '4. highest reasoning',
      billable: false,
      ok: true,
      detail: `skipped — reasoning kind "${capabilities.reasoning.kind}" has no selectable level`,
      ms: 0,
    });
    return outcomes;
  }

  const values = acceptedReasoningValues(capabilities);
  const highest = values[values.length - 1];
  const raised = AIServiceFactory.createServiceFromConfiguration({
    ...capped(config),
    thinkingLevel: highest,
  } as AIConfiguration);
  const four = await measure(() =>
    raised.translateText({
      text: 'Please bring your identification and a proof of address.',
      targetLanguage: 'Spanish',
      context: 'food',
    }),
  );
  outcomes.push({
    model,
    configId: config.id,
    request: `4. reasoning=${highest}`,
    billable: true,
    ok: Boolean(four.result?.translatedText),
    detail: four.result?.translatedText ?? describeFailure(four.error),
    ms: four.ms,
    promptTokens: four.usage.promptTokens,
    completionTokens: four.usage.completionTokens,
    costUsd: four.usage.totalCost,
  });

  return outcomes;
};

const describeFailure = (error: unknown): string => {
  if (!error) return 'no error reported';
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, ' ').slice(0, 200);
};

const usd = (n: number): string => `$${n.toFixed(4)}`;

export const main = async (args = process.argv.slice(2)): Promise<void> => {
  const options = parseArgs(args);
  const configs = await selectConfigurations(options);

  if (!configs.length) {
    console.log('No live configurations match. Nothing to do.');
    return;
  }

  console.log(`\nFEED live smoke sweep — ${configs.length} configuration(s)\n`);

  let projectedTotal = 0;
  for (const config of configs) {
    const worst = projectedCost(config);
    if (worst !== null) projectedTotal += worst;
    const entry = findCatalogueEntry(config.model!);
    console.log(
      `  [${String(config.id).padStart(2)}] ${(config.model ?? '?').padEnd(26)} `
      + `${(config.serviceType ?? '?').padEnd(10)} ${(entry?.costTier ?? 'uncatalogued').padEnd(9)} `
      + `projected ${worst === null ? 'unknown (unpriced model or configuration)' : usd(worst)}`,
    );
  }
  console.log(
    `\n  Output is capped at ${SWEEP_OUTPUT_CAP} tokens per request and enforced, so the`
    + `\n  output allowance applies to each attempt. Input is assumed at`
    + `\n  ${ASSUMED_INPUT_TOKENS} tokens per request and is NOT enforced — a larger prompt row`
    + `\n  moves it. Reservations include up to three attempts per call; this is not a hard dollar cap.`
    + `\n  Request 4 proves the highest reasoning level is accepted, not how long`
    + `\n  a model would think unbounded.`
    + `\n\n  Projected for the billable half: ${usd(projectedTotal)}`
    + `\n  Ceiling for this run: ${usd(options.ceiling)}\n`,
  );

  if (!options.bill && !options.unbilledOnly) {
    console.log('Plan only — no request was sent. Add --unbilled for the free');
    console.log('checks, or --bill to run the whole sweep.\n');
    return;
  }

  const outcomes: RequestOutcome[] = [];
  const budget = { ceiling: options.ceiling, reserved: 0, spent: 0 };

  for (const config of configs) {
    // Cap before anything is built from the row, and clear the prompt cache
    // so no uncapped resolution survives from an earlier configuration.
    PromptBuilder.clearCache();
    const sweepConfig = capped(config);
    const service = AIServiceFactory.createServiceFromConfiguration(sweepConfig);

    outcomes.push(...(await unbilledRequests(sweepConfig, service)));

    if (!options.bill) continue;

    if (projectedCost(sweepConfig) === null) {
      outcomes.push({ model: sweepConfig.model!, configId: config.id, request: 'billable requests',
        billable: false, ok: false, detail: 'Unpriced model or configuration: billable requests refused.', ms: 0 });
      continue;
    }
    try {
      await billableRequests(sweepConfig, service, budget, outcomes);
    } catch (error) {
      console.error(`Sweep stopped: ${describeFailure(error)} Recorded so far: ${usd(budget.spent)}.`);
      process.exitCode = 1;
      break;
    }
  }

  console.log('\nResults\n');
  for (const o of outcomes) {
    const tokens =
      o.promptTokens === undefined
        ? ''
        : ` ${o.promptTokens}in/${o.completionTokens}out ${usd(o.costUsd ?? 0)}`;
    console.log(
      `  ${o.ok ? 'pass' : 'FAIL'}  ${(o.model ?? '').padEnd(26)} `
      + `${o.request.padEnd(28)} ${String(o.ms).padStart(6)}ms${tokens}`,
    );
    if (!o.ok || o.detail.startsWith('skipped')) console.log(`        ${o.detail}`);
  }

  const failures = outcomes.filter((o) => !o.ok).length;
  console.log(
    `\n  ${outcomes.length - failures} passed, ${failures} failed. `
    + `Recorded spend this run: ${usd(budget.spent)}.\n`,
  );
  console.log('  Spend is recorded as UsageRecord rows against each configuration');
  console.log('  and will appear in the usage dashboard.\n');

  if (failures) process.exitCode = 1;
};

if (require.main === module) main()
  .catch((error) => {
    console.error('Live smoke sweep failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
