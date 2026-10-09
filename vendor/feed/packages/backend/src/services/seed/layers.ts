// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { SUPPORTED_LANGUAGES } from './supported-languages';

/**
 * What a clean slate contains, in three layers.
 *
 * A clean slate is not one thing. These layers have different owners and
 * different lifetimes, and separating them is what makes the "with or without
 * examples" choice coherent — see
 * docs/data-management/clean-slate-and-seed.md.
 *
 * **Structural** — what makes FEED work rather than merely be empty. No
 * opinions about any particular pantry. Always present.
 *
 * **Reference** — facts rather than choices: the supported languages as
 * *available*, and the system prompts, which are FEED's AI behaviour rather
 * than an agency's content. Always present.
 *
 * **Illustrative** — opinions about a pantry that may not be this one.
 * Optional, and the default only because a first-run instance is where the
 * choice matters most: an empty Shopping List Builder teaches nothing.
 *
 * This lives under `src/` rather than in `scripts/` on purpose. The production
 * image installs with `--omit=dev` and never copies `scripts/`, so seed content
 * kept there cannot back a user-facing action — the same trap the operator CLI
 * hit in beta.4.
 */

/**
 * Deliberately small: three categories and nine items, against the eight
 * categories and ~70 items the development seed carries.
 *
 * Its job is to demonstrate structure, not to look like a stocked pantry. A
 * large seeded inventory invites two failures — someone mistakes it for real
 * data, or someone spends their first hour deleting it.
 */

export interface SeedCategory {
  name: string;
  /**
   * 100 is FEED's sentinel for "No Limit", not a literal cap of a hundred:
   * the category form maps its `no-limit` option to 100 on submit
   * (`useCategoryForm.getFormattedLimit`). Writing 100 here is what makes
   * Produce read as "No Limit" on screen.
   */
  limit: number;
  limitType: string;
  icon: string;
}

export interface SeedFoodItem {
  name: string;
  categoryName: string;
  limit: number;
  /**
   * `isInStock`, `isLimited`, and `isClearance` are the three **status flags**
   * (`StatusFlagsGroup`), and they are independent of the numeric `limit`
   * above. `isLimited` paints the "Limited" badge on shopping lists; it does
   * not cap anything. An item can carry a limit of 1 without wearing the badge,
   * and that is the common case here.
   */
  isLimited: boolean;
  isInStock: boolean;
  isClearance: boolean;
  vegan: boolean;
  vegetarian: boolean;
  glutenFree: boolean;
  organic: boolean;
  halal: boolean;
  kosher: boolean;
  readyToEat: boolean;
}

export const ILLUSTRATIVE_CATEGORIES: readonly SeedCategory[] = [
  // No limits: staff take what they need, capped only by the Global Limit.
  { name: 'Produce', limit: 100, limitType: 'household', icon: 'apple' },
  { name: 'Dairy', limit: 3, limitType: 'household', icon: 'glass-water' },
  { name: 'Meat', limit: 3, limitType: 'household', icon: 'drumstick' },
];

/**
 * Dietary flags are facts about the food, not pantry policy, so they are set
 * accurately rather than left at defaults — an example that mislabels cheese as
 * vegan teaches the wrong thing about the fields.
 *
 * The three statuses are spread one per category so the inventory table does
 * not read as uniformly green, and so the Shopping List Builder has a real
 * out-of-stock row to render.
 */
export const ILLUSTRATIVE_FOOD_ITEMS: readonly SeedFoodItem[] = [
  // --- Produce: no item limits, matching the category. ---
  {
    name: 'Apples',
    categoryName: 'Produce',
    limit: 100,
    isLimited: false,
    isInStock: true,
    isClearance: false,
    vegan: true, vegetarian: true, glutenFree: true, organic: false,
    halal: true, kosher: true, readyToEat: true,
  },
  {
    // Out of stock: the status a shopping list has to be able to show.
    name: 'Carrots',
    categoryName: 'Produce',
    limit: 100,
    isLimited: false,
    isInStock: false,
    isClearance: false,
    vegan: true, vegetarian: true, glutenFree: true, organic: false,
    halal: true, kosher: true, readyToEat: true,
  },
  {
    name: 'Grapes',
    categoryName: 'Produce',
    limit: 100,
    isLimited: false,
    isInStock: true,
    isClearance: false,
    vegan: true, vegetarian: true, glutenFree: true, organic: false,
    halal: true, kosher: true, readyToEat: true,
  },

  // --- Dairy: category allows 3, each item 1. ---
  {
    name: 'Milk',
    categoryName: 'Dairy',
    limit: 1,
    isLimited: false,
    isInStock: true,
    isClearance: false,
    vegan: false, vegetarian: true, glutenFree: true, organic: false,
    halal: true, kosher: true, readyToEat: true,
  },
  {
    name: 'Cheese',
    categoryName: 'Dairy',
    limit: 1,
    isLimited: false,
    isInStock: true,
    isClearance: false,
    vegan: false, vegetarian: true, glutenFree: true, organic: false,
    halal: true, kosher: true, readyToEat: true,
  },
  {
    // Clearance: moving quickly, take extra.
    name: 'Yogurt',
    categoryName: 'Dairy',
    limit: 1,
    isLimited: false,
    isInStock: true,
    isClearance: true,
    vegan: false, vegetarian: true, glutenFree: true, organic: false,
    halal: true, kosher: true, readyToEat: true,
  },

  // --- Meat: category allows 3, each item 1. ---
  {
    // The one item wearing the "Limited" badge. Every Dairy and Meat item here
    // has a limit of 1; the badge is a separate signal about scarcity, and
    // putting it on exactly one item is what demonstrates the difference.
    name: 'Chicken',
    categoryName: 'Meat',
    limit: 1,
    isLimited: true,
    isInStock: true,
    isClearance: false,
    vegan: false, vegetarian: false, glutenFree: true, organic: false,
    halal: false, kosher: false, readyToEat: false,
  },
  {
    name: 'Beef',
    categoryName: 'Meat',
    limit: 1,
    isLimited: false,
    isInStock: true,
    isClearance: false,
    vegan: false, vegetarian: false, glutenFree: true, organic: false,
    halal: false, kosher: false, readyToEat: false,
  },
  {
    // Halal and kosher are false across all three meats: for chicken and beef
    // that depends on slaughter and provenance an example cannot assert, and
    // for pork it is never true. Claiming otherwise in seed data would teach
    // staff to trust a flag nobody verified.
    name: 'Pork',
    categoryName: 'Meat',
    limit: 1,
    isLimited: false,
    isInStock: true,
    isClearance: false,
    vegan: false, vegetarian: false, glutenFree: true, organic: false,
    halal: false, kosher: false, readyToEat: false,
  },
];

/** Structural: present in every clean slate, with or without examples. */
export const STRUCTURAL = {
  /** The cap applied to items carrying no item-level limit. */
  globalLimit: 10,
  /** English is enabled; everything else is merely available. */
  enabledLanguage: 'English',
} as const;

export const REFERENCE_LANGUAGES = SUPPORTED_LANGUAGES;
