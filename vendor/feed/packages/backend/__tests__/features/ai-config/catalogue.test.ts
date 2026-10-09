// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Invariants the catalogue has to hold, and the measured facts it records.
 *
 * The duplicated `model-specs.ts` had no invariants at all, which is how it
 * came to offer a model that had been shut down for six months and to carry
 * an effort default the replacement model rejects (ISSUES.md #84).
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, test } from 'vitest';

import {
  CATALOGUE,
  acceptsReasoningValue,
  capabilitiesFor,
  entriesForProvider,
  findCatalogueEntry,
  leastCostReasoning,
  languageCoverageFor,
  normalizeCatalogueLanguage,
  resolveReasoning,
  selectableEntries,
  supportedLanguagesFor,
  type CatalogueEntry,
} from '../../../src/services/ai/catalogue';

describe('catalogue invariants', () => {
  test('every id is unique', () => {
    const ids = CATALOGUE.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('every entry carries a price with the date it was checked', () => {
    for (const entry of CATALOGUE) {
      expect(entry.pricing.input, entry.id).toBeGreaterThan(0);
      expect(entry.pricing.output, entry.id).toBeGreaterThan(0);
      // A stale price never errors; it silently mis-projects spend limits.
      expect(entry.pricing.verifiedAt, entry.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test('every named replacement resolves to a real entry', () => {
    // A replacement pointing at nothing is worse than none: the interface
    // would tell an administrator to move to a model that does not exist.
    for (const entry of CATALOGUE) {
      const { replacement } = entry.lifecycle;
      if (!replacement) continue;
      const target = findCatalogueEntry(replacement);
      const named = target !== undefined;
      // Until the 2026 families land, a replacement may legitimately name a
      // model not yet in the catalogue — but it must never name a retired one.
      if (named) {
        expect(target!.lifecycle.status, `${entry.id} -> ${replacement}`).not.toBe('retired');
      }
    }
  });

  test('a retired model is never offered', () => {
    const retired = CATALOGUE.filter((e) => e.lifecycle.status === 'retired').map((e) => e.id);
    const offered = selectableEntries().map((e) => e.id);
    for (const id of retired) expect(offered).not.toContain(id);
    // gemini-3-pro-preview shut down 2026-03-09 and was still selectable.
    expect(retired).toContain('gemini-3-pro-preview');
  });

  test('withdrawing a preset never claims the provider shut it down', () => {
    // `status` is the provider's reality and `offered` is FEED's choice, and
    // the refresh needs both: it drops 15 presets while `gpt-5-mini` still
    // serves production until 2026-12-11. Marking a working model `retired`
    // to get it out of the dialog would be a lie in the data, and would take
    // the entry production's saved row resolves against.
    for (const entry of CATALOGUE) {
      if (entry.lifecycle.offered !== false) continue;
      expect(entry.lifecycle.status, `${entry.id} is unoffered`).not.toBe('active');
      // Whatever the reason it is no longer a choice, the entry must remain
      // resolvable for the configurations still pointing at it.
      expect(findCatalogueEntry(entry.id), entry.id).toBeDefined();
    }
  });

  test('an unoffered model keeps its capabilities for the rows still using it', () => {
    // The whole point of keeping it in CATALOGUE rather than deleting it.
    const unoffered = CATALOGUE.filter((e) => e.lifecycle.offered === false);
    for (const entry of unoffered) {
      const capabilities = capabilitiesFor(entry.provider, entry.id);
      expect(capabilities, entry.id).toBe(entry.capabilities);
    }
  });

  test('frontier tier means an output price of $20/1M or more', () => {
    for (const entry of CATALOGUE) {
      if (entry.costTier === 'frontier') {
        expect(entry.pricing.output, entry.id).toBeGreaterThanOrEqual(20);
      } else {
        expect(entry.pricing.output, entry.id).toBeLessThan(20);
      }
    }
  });

  test('a shutdown date is a date', () => {
    for (const entry of CATALOGUE) {
      if (entry.lifecycle.shutdownDate) {
        expect(entry.lifecycle.shutdownDate, entry.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  test('only a deprecated or retired model carries a shutdown date', () => {
    // A provider commits to a date when it deprecates; before that it may
    // publish a floor. Anthropic prints both in one column headed "Tentative
    // retirement date", and three entries here recorded "not sooner than"
    // floors as though they were announcements — including Claude Haiku 4.5,
    // the catalogue's only `active` model, which would have had the interface
    // announce a shutdown Anthropic has not scheduled.
    for (const entry of CATALOGUE) {
      if (!entry.lifecycle.shutdownDate) continue;
      expect(
        entry.lifecycle.status,
        `${entry.id} carries ${entry.lifecycle.shutdownDate}; a tentative floor belongs in note`
      ).toMatch(/^(deprecated|retired)$/);
    }
  });

  test('every reasoning control offers its least-cost value', () => {
    for (const entry of CATALOGUE) {
      const least = leastCostReasoning(entry);
      if (least === null) continue;
      expect(acceptsReasoningValue(entry, least), entry.id).toBe(true);
    }
  });

  test('every model answers for every FEED language', () => {
    for (const entry of CATALOGUE) {
      expect(Object.keys(entry.languages ?? {}), entry.id).toHaveLength(59);
      expect(Object.values(entry.languages ?? {}), entry.id).not.toContain(undefined);
    }
  });
});

describe('language coverage', () => {
  test('preserves the provider allowlists in one catalogue source', () => {
    expect(languageCoverageFor('OpenAI', 'gpt-5.6-luna', 'Tagalog')).toBe('supported');
    expect(languageCoverageFor('Google', 'gemini-3.5-flash-lite', 'Tagalog')).toBe('unsupported');
    expect(languageCoverageFor('Anthropic', 'claude-haiku-4-5-20251001', 'Somali')).toBe('unsupported');
    expect(supportedLanguagesFor('Google', 'gemini-3.5-flash-lite')).not.toContain('Somali');
  });

  test('normalizes legacy codes and case before checking coverage', () => {
    expect(normalizeCatalogueLanguage('AR')).toBe('Arabic');
    expect(normalizeCatalogueLanguage('  persian ')).toBe('Persian');
    expect(languageCoverageFor('Google', 'gemini-3.5-flash-lite', 'so')).toBe('unsupported');
  });

  test('does not claim coverage for a language FEED does not know', () => {
    expect(languageCoverageFor('OpenAI', 'gpt-5.6-luna', 'Klingon')).toBeUndefined();
  });
});

describe('the capabilities that string tests could not express', () => {
  const entry = (id: string): CatalogueEntry => {
    const found = findCatalogueEntry(id);
    if (!found) throw new Error(`missing catalogue entry: ${id}`);
    return found;
  };

  test('Claude 4.5 takes one sampling parameter and a prefill', () => {
    const haiku = entry('claude-haiku-4-5-20251001');
    expect(haiku.capabilities.sampling).toBe('temperature-or-top-p');
    expect(haiku.capabilities.prefill).toBe('allowed');
  });

  test('Claude entries carry the non-streaming ceiling the SDK needs', () => {
    // The SDK refuses a non-streaming request whose expected duration passes
    // ten minutes, and a 64K output limit sails past it.
    for (const claude of entriesForProvider('Anthropic')) {
      expect(claude.capabilities.nonStreamingOutputCeiling, claude.id).toBe(20480);
    }
  });

  test('gpt-5-nano accepts minimal effort — the value GPT-5.6 rejects', () => {
    // Measured 2026-09-11: gpt-5.6-luna answers `400 Unsupported value:
    // 'reasoning_effort' does not support 'minimal' with this model`. Two
    // models, two answers, which is why this is per-entry data and not one
    // shared union.
    const nano = entry('gpt-5-nano-2025-08-07');
    expect(acceptsReasoningValue(nano, 'minimal')).toBe(true);
    expect(leastCostReasoning(nano)).toBe('minimal');
  });

  test('OpenAI reasoning models want max_completion_tokens, and the rest do not', () => {
    // Also measured: `max_tokens` is refused outright by GPT-5.6, which is
    // what makes the Custom path unusable there until it carries a profile.
    //
    // This once asserted `max_completion_tokens` for *every* OpenAI entry,
    // which held only because the gpt-4.1 and gpt-4o families were missing
    // from the catalogue. They take the opposite field, so the split is the
    // point of the test rather than an exception to it.
    for (const openai of entriesForProvider('OpenAI')) {
      const reasons = openai.capabilities.reasoning.kind !== 'none';
      expect(openai.capabilities.maxTokensField, openai.id).toBe(
        reasons ? 'max_completion_tokens' : 'max_tokens'
      );
    }
  });

  test('gpt-4o is priced at what OpenAI charges, not what FEED remembered', () => {
    // Carried as $5.00/$20.00 from the day it was added; OpenAI's pricing page
    // says $2.50/$10.00. A wrong price never raises an error — it mis-projects
    // the spend limits it feeds, and $20.00 sat exactly on the `frontier`
    // threshold, so it would also have warned about a model that is standard.
    const entry = findCatalogueEntry('gpt-4o-2024-05-13')!;
    expect(entry.pricing).toMatchObject({ input: 2.5, output: 10.0 });
    expect(entry.costTier).toBe('standard');
  });

  test('a replacement never points at a model with less life left', () => {
    // Weaker than it sounds if left to the retired-only check: naming a
    // successor that shuts down before the model it replaces is worse advice
    // than naming none, and nothing else here would catch it.
    const shutdown = (entry: CatalogueEntry) => entry.lifecycle.shutdownDate;
    for (const entry of CATALOGUE) {
      const target = findCatalogueEntry(entry.lifecycle.replacement);
      if (!target) continue;
      const ownEnd = shutdown(entry);
      const targetEnd = shutdown(target);
      if (!targetEnd) continue;
      expect(
        ownEnd === undefined ? false : targetEnd >= ownEnd,
        `${entry.id} (ends ${ownEnd ?? 'never'}) -> ${target.id} (ends ${targetEnd})`
      ).toBe(true);
    }
  });

  test('the Gemini thinking floors are the ones the API enforces', () => {
    // Measured 2026-09-12. Same list price, and the difference is not just
    // that 3.6 *allows* a lower setting: at `minimal` it spends no thinking
    // tokens, while 3.8 answers `400 Thinking level MINIMAL is not supported
    // for this model` and bills 11 at its `low` floor — on every request,
    // however short. That is the whole of D27.
    expect(leastCostReasoning(entry('gemini-3.6-flash'))).toBe('minimal');
    expect(leastCostReasoning(entry('gemini-3.8-flash'))).toBe('low');
    expect(acceptsReasoningValue(entry('gemini-3.8-flash'), 'minimal')).toBe(false);
    expect(acceptsReasoningValue(entry('gemini-3.6-flash'), 'minimal')).toBe(true);

    // The default preset must be able to think as little as possible (D2).
    expect(leastCostReasoning(entry('gemini-3.5-flash-lite'))).toBe('minimal');

    // Gemini 3.x takes temperature at one value only; `supported` plus a fixed
    // value, not `unsupported`, because the parameter is still sent.
    for (const id of ['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.8-flash']) {
      expect(entry(id).capabilities.fixedTemperature, id).toBe(1.0);
      expect(entry(id).capabilities.sampling, id).toBe('supported');
    }
  });

  test('the preview preset is marked preview, so the badge has something to read', () => {
    // D26: offered, but never mistaken for stable. Google's previews churn —
    // the one this replaces lasted under four months.
    expect(entry('gemini-3.1-pro-preview').lifecycle.status).toBe('preview');
  });

  test('the price rise Google has already announced is recorded', () => {
    // A doubling on 2027-01-01 that no one will remember by then. Spend limits
    // sized against today's price trip twice as late once it lands.
    expect(entry('gemini-3.6-flash').pricing.changesOn).toBe('2027-01-01');
    expect(entry('gemini-3.8-flash').pricing.changesOn).toBe('2027-01-01');
  });

  test('the withdrawn Gemini model records why it fails', () => {
    const withdrawn = entry('gemini-2.5-flash-lite');
    expect(withdrawn.lifecycle.status).toBe('deprecated');
    expect(withdrawn.lifecycle.replacement).toBe('gemini-3.5-flash-lite');
    expect(withdrawn.lifecycle.note).toMatch(/no longer available to new users/);
  });
});

describe('the dialog keeps no model list of its own', () => {
  // This began as a drift guard comparing the catalogue against the frontend's
  // `model-specs.ts`, and it earned its place: when the catalogue was
  // introduced it restated 11 of the 16 models the dialog offered, and the
  // five missing ones stayed missing until that comparison was written.
  //
  // The dialogs read `GET /api/ai-config/models` now and the duplicate is
  // deleted, so there is no longer a second list to compare against — which
  // makes the useful invariant the stronger one: that it stays deleted. The
  // precedent for why is named in
  // `brand-theme/__tests__/palette-drift.test.ts`: two lists identical today
  // and enforced by nothing is how a model shut down for six months went on
  // being offered.
  const FRONTEND_SPECS = resolve(
    __dirname,
    '../../../../frontend/src/components/ai-configuration/model-specs.ts'
  );

  test('the frontend model-specs duplicate has not come back', () => {
    expect(
      existsSync(FRONTEND_SPECS),
      'a second model list has reappeared in the frontend; the catalogue is the only source (ISSUES.md #84)'
    ).toBe(false);
  });
});

describe('models the catalogue has never heard of', () => {
  test('a dateless Claude id is assumed to refuse sampling and prefill', () => {
    // `claude-sonnet-5` is reachable through the Custom field today and gets
    // no entry until Phase 4. Guessing wrong here is a 400, so the guess is
    // the conservative one.
    const caps = capabilitiesFor('Anthropic', 'claude-sonnet-5');
    expect(caps.sampling).toBe('unsupported');
    expect(caps.prefill).toBe('rejected');
    expect(caps.nonStreamingOutputCeiling).toBe(20480);
  });

  test('a dated Claude id keeps the older behaviour', () => {
    const caps = capabilitiesFor('Anthropic', 'claude-sonnet-4-20250514');
    expect(caps.sampling).toBe('temperature-or-top-p');
    expect(caps.prefill).toBe('allowed');
  });

  test('an unknown GPT-5 id is never offered minimal effort', () => {
    // `minimal` is valid on the 2025-08-07 snapshots and refused by GPT-5.6,
    // so a guess about an unrecognised id may only offer what the whole family
    // takes. This used `gpt-5.6-luna` as the unknown id until the 2026 refresh
    // catalogued it — the example was adopted, so it needs one that is still
    // genuinely absent.
    const caps = capabilitiesFor('OpenAI', 'gpt-5.9-unreleased');
    expect(findCatalogueEntry('gpt-5.9-unreleased')).toBeUndefined();
    expect(caps.maxTokensField).toBe('max_completion_tokens');
    expect(caps.reasoning).toMatchObject({ kind: 'effort', leastCost: 'low' });
    expect(resolveReasoning(caps, 'minimal').value).toBe('low');
  });

  test('a catalogued GPT-5.6 id answers with what was measured, not the guess', () => {
    // The other half of the same point. Inference offers `low` because that is
    // safe for the family; the real entry knows luna accepts `none`, which is
    // cheaper and is what D2 wants. Measured 2026-09-12 — `max` returns
    // `400 ... does not support 'max' with this model`.
    const caps = capabilitiesFor('OpenAI', 'gpt-5.6-luna');
    expect(caps.reasoning).toMatchObject({ kind: 'effort', leastCost: 'none' });
    expect(resolveReasoning(caps, null).value).toBe('none');
    expect(acceptsReasoningValue(findCatalogueEntry('gpt-5.6-luna')!, 'max')).toBe(false);
    // And gpt-6-astra refuses `none`, so a family-wide rule would 400 on it.
    const astra = capabilitiesFor('OpenAI', 'gpt-6-astra');
    expect(astra.reasoning).toMatchObject({ kind: 'effort', leastCost: 'low' });
    expect(resolveReasoning(astra, 'none').value).toBe('low');
  });

  test('an unknown Gemini 3-or-later id gets a thinking level and a fixed temperature', () => {
    const caps = capabilitiesFor('Google', 'gemini-3.8-flash');
    expect(caps.reasoning.kind).toBe('thinking-level');
    expect(caps.fixedTemperature).toBe(1.0);
  });

  test('an unknown Gemini 2.5 id gets neither', () => {
    const caps = capabilitiesFor('Google', 'gemini-2.5-something');
    expect(caps.reasoning.kind).toBe('none');
    expect(caps.fixedTemperature).toBeUndefined();
  });

  test('a known id always beats the guess', () => {
    // The whole point: measurement wins over inference wherever it exists.
    expect(capabilitiesFor('OpenAI', 'gpt-5-nano-2025-08-07').reasoning).toMatchObject({
      leastCost: 'minimal',
    });
  });
});

describe('resolving a saved thinking level', () => {
  const caps = (provider: CatalogueEntry['provider'], id: string) => capabilitiesFor(provider, id);

  test('an unset level falls to the cheapest the model accepts', () => {
    expect(resolveReasoning(caps('OpenAI', 'gpt-5-nano-2025-08-07'), null).value).toBe('minimal');
  });

  test('a level the model accepts is sent as chosen', () => {
    const resolved = resolveReasoning(caps('OpenAI', 'gpt-5-2025-08-07'), 'high');
    expect(resolved.value).toBe('high');
    expect(resolved.warnings).toEqual([]);
  });

  test('a level the model refuses is substituted, and says so', () => {
    // gemini-3-pro-preview takes only low and high.
    const resolved = resolveReasoning(caps('Google', 'gemini-3-pro-preview'), 'medium');
    expect(resolved.value).toBe('low');
    expect(resolved.warnings[0]).toMatch(/does not accept the thinking level "medium"/);
  });

  test('a model with no reasoning control sends nothing, and does not fail', () => {
    // The old per-provider copies silently dropped this. Silence is how an
    // administrator comes to believe a setting is in effect when it is not.
    const resolved = resolveReasoning(caps('Google', 'gemini-2.5-flash'), 'high');
    expect(resolved.value).toBeUndefined();
    expect(resolved.warnings[0]).toMatch(/no thinking or reasoning control/);
  });

  test('Claude keeps extended thinking off for this work', () => {
    const resolved = resolveReasoning(caps('Anthropic', 'claude-haiku-4-5-20251001'), 'high');
    expect(resolved.value).toBeUndefined();
    expect(resolved.warnings[0]).toMatch(/Extended thinking stays off/);
  });
});
