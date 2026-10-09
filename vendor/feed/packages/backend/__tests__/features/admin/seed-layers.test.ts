// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { describe, expect, it } from 'vitest';

import {
  EXAMPLE_SAVED_COMPONENTS,
  TEMPLATE_BLUEPRINT,
  TEMPLATE_REQUIRES,
  buildExampleTemplateData,
} from '../../../src/services/seed/example-template';
import { SEED_SYSTEM_PROMPTS } from '../../../src/services/seed/system-prompts';
import {
  ILLUSTRATIVE_CATEGORIES,
  ILLUSTRATIVE_FOOD_ITEMS,
  REFERENCE_LANGUAGES,
  STRUCTURAL,
} from '../../../src/services/seed/layers';

/**
 * The clean slate is what a new deployment sees first, and what an established
 * pantry gets back when it resets. Its content is a decision, not an
 * implementation detail — so the decisions are pinned here rather than left to
 * whoever edits the array next.
 */

const byName = (name: string) =>
  ILLUSTRATIVE_FOOD_ITEMS.find(item => item.name === name);

describe('clean slate: illustrative layer', () => {
  it('stays small enough to read as an example', () => {
    // A large seeded inventory invites two failures: someone mistakes it for
    // real data, or someone spends their first hour deleting it.
    expect(ILLUSTRATIVE_CATEGORIES).toHaveLength(3);
    expect(ILLUSTRATIVE_FOOD_ITEMS).toHaveLength(9);
  });

  it('gives every item a category that is actually seeded', () => {
    const categories = new Set(ILLUSTRATIVE_CATEGORIES.map(c => c.name));
    for (const item of ILLUSTRATIVE_FOOD_ITEMS) {
      expect(categories, `${item.name} names ${item.categoryName}`).toContain(
        item.categoryName
      );
    }
  });

  it('leaves Produce unlimited and caps Dairy and Meat at 3', () => {
    const limits = Object.fromEntries(
      ILLUSTRATIVE_CATEGORIES.map(c => [c.name, c.limit])
    );
    // 100 is FEED's sentinel for "No Limit" (useCategoryForm.getFormattedLimit),
    // not a literal cap — writing anything else makes Produce read as capped.
    expect(limits.Produce).toBe(100);
    expect(limits.Dairy).toBe(3);
    expect(limits.Meat).toBe(3);
  });

  it('gives Dairy and Meat items a limit of 1 and Produce items none', () => {
    for (const item of ILLUSTRATIVE_FOOD_ITEMS) {
      if (item.categoryName === 'Produce') expect(item.limit).toBe(100);
      else expect(item.limit, `${item.name}`).toBe(1);
    }
  });

  it('paints exactly one status badge per category', () => {
    // The badges are independent of the numeric limit: `isLimited` is a
    // "Limited" marker on shopping lists, not a cap. Setting it on every item
    // with a limit of 1 — the mistake this test exists to catch — would make
    // six items wear it and demonstrate nothing.
    expect(byName('Carrots')?.isInStock).toBe(false);
    expect(byName('Chicken')?.isLimited).toBe(true);
    expect(byName('Yogurt')?.isClearance).toBe(true);

    expect(ILLUSTRATIVE_FOOD_ITEMS.filter(i => !i.isInStock)).toHaveLength(1);
    expect(ILLUSTRATIVE_FOOD_ITEMS.filter(i => i.isLimited)).toHaveLength(1);
    expect(ILLUSTRATIVE_FOOD_ITEMS.filter(i => i.isClearance)).toHaveLength(1);
  });

  it('describes the food accurately, because the flags teach what they mean', () => {
    expect(byName('Grapes')?.vegan).toBe(true);
    // Cheese and yogurt are vegetarian but not vegan — an example that got this
    // wrong would teach staff the wrong thing about the fields.
    expect(byName('Cheese')?.vegan).toBe(false);
    expect(byName('Cheese')?.vegetarian).toBe(true);
    expect(byName('Beef')?.vegetarian).toBe(false);
  });
});

describe('clean slate: structural and reference layers', () => {
  it('carries every supported language as available', () => {
    expect(REFERENCE_LANGUAGES.length).toBe(59);
  });

  it('enables only English', () => {
    // A fresh instance with 59 languages switched on would put 59 columns of
    // untranslated text in front of staff on day one.
    expect(STRUCTURAL.enabledLanguage).toBe('English');
    expect(REFERENCE_LANGUAGES.some(l => l.name === STRUCTURAL.enabledLanguage)).toBe(true);
  });

  it('sets a global limit, so uncapped items are still bounded', () => {
    expect(STRUCTURAL.globalLimit).toBeGreaterThan(0);
  });

  it('gives languages a stable, gap-free ordering', () => {
    const orders = REFERENCE_LANGUAGES.map(l => l.sortOrder);
    expect(new Set(orders).size).toBe(orders.length);
    expect(Math.min(...orders)).toBe(1);
    expect(Math.max(...orders)).toBe(REFERENCE_LANGUAGES.length);
  });
});

describe('the example Builder template', () => {
  it('stores ids as placeholders, never as literals', () => {
    // The authored template referenced categoryId 14 and foodItemIds in the
    // 170s. Those come from SQLite's autoincrement high-water mark, which
    // survives the deletes a reset performs — so they differ on every instance
    // and after every reset. A literal id here would bind the example table to
    // whatever rows happen to hold that id later.
    const raw = JSON.stringify(TEMPLATE_BLUEPRINT);
    expect(raw).not.toMatch(/"categoryId":\s*\d+/);
    expect(raw).not.toMatch(/"foodItemId":\s*\d+/);
    expect(raw).toMatch(/@@CAT:/);
    expect(raw).toMatch(/@@ITEM:/);
  });

  it('only references inventory the illustrative layer creates', () => {
    // Otherwise the template renders an empty table, which reads as a Builder
    // bug rather than a seeding one.
    const categories = new Set(ILLUSTRATIVE_CATEGORIES.map(c => c.name));
    const items = new Set(ILLUSTRATIVE_FOOD_ITEMS.map(i => i.name));

    for (const name of TEMPLATE_REQUIRES.categories) expect(categories).toContain(name);
    for (const name of TEMPLATE_REQUIRES.items) expect(items).toContain(name);
  });

  it('leaves the out-of-stock item off the list', () => {
    // Carrots is seeded out of stock, and shopping lists show what is
    // available. Its absence from the template is the demonstration, not an
    // oversight — if it ever appears here, one of the two is wrong.
    expect(TEMPLATE_REQUIRES.items).not.toContain('Carrots');
    expect(ILLUSTRATIVE_FOOD_ITEMS.find(i => i.name === 'Carrots')?.isInStock).toBe(false);
  });

  it('substitutes real ids for every placeholder', () => {
    const categoryIds = new Map(ILLUSTRATIVE_CATEGORIES.map((c, i) => [c.name, 100 + i]));
    const itemIds = new Map(ILLUSTRATIVE_FOOD_ITEMS.map((f, i) => [f.name, 200 + i]));

    const built = JSON.stringify(buildExampleTemplateData(categoryIds, itemIds));

    expect(built).not.toMatch(/@@(CAT|ITEM):/);
    expect(built).toContain('"categoryId":100');
  });

  it('refuses to build against inventory that is missing', () => {
    // Silently binding to nothing would ship a broken example.
    expect(() => buildExampleTemplateData(new Map(), new Map())).toThrow(/did not create/);
  });

  it('ships the reusable blocks the template was built from', () => {
    expect(EXAMPLE_SAVED_COMPONENTS.length).toBeGreaterThanOrEqual(8);
    // These carry no inventory ids, so they need no substitution.
    expect(JSON.stringify(EXAMPLE_SAVED_COMPONENTS)).not.toMatch(/foodItemId|categoryId/);
  });
});

describe('system prompts are reference data', () => {
  it('ships the prompts that drive translation behaviour', () => {
    // These were defined only in scripts/seed-all.ts, which the production
    // image never copies. A reset clears SystemPrompt — it is in the backup
    // contract — and had nothing to put back, leaving the instance with no
    // prompts at all. That is why they live under src/ now.
    const types = SEED_SYSTEM_PROMPTS.map(p => p.promptType);
    expect(types).toContain('CLASSIFICATION');
    expect(types).toContain('BATCH_TRANSLATION');
    expect(types).toContain('FOOD_TRANSLATION');
  });

  it('arrives active, or the prompts exist without taking effect', () => {
    for (const prompt of SEED_SYSTEM_PROMPTS) {
      expect(prompt.isActive, prompt.name).toBe(true);
    }
  });

  it('names every prompt uniquely, since the seed upserts by name', () => {
    const names = SEED_SYSTEM_PROMPTS.map(p => p.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
