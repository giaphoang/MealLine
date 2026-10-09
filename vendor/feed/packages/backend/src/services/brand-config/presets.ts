// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger. MealLine adaptation.
import { hexToOklch, hslToOklch } from '../brand-theme/color';
import type { BrandConfig } from './config-schema';
import { BRAND_CONFIG_SCHEMA_VERSION } from './config-schema';

export const FEED_TAGLINE = 'Food access infrastructure';
export const NOURISH_BRAND_CONFIG: BrandConfig = {
  schemaVersion: BRAND_CONFIG_SCHEMA_VERSION,
  identity: {
    organizationName: 'MealLine', appName: 'MealLine', tagline: FEED_TAGLINE,
    description: 'Voice intake, food inventory, multilingual client materials, and household delivery.',
    organizationWebsite: 'http://localhost:3003',
  },
  logo: {
    light: { kind: 'builtin', src: '/brand/mealline-mark.svg', width: 64, height: 64 },
    dark: { kind: 'builtin', src: '/brand/mealline-mark.svg', width: 64, height: 64 },
    square: { kind: 'builtin', src: '/brand/mealline-mark.svg', width: 64, height: 64 },
    presentation: 'transparent',
  },
  colors: {
    accent: hexToOklch('#15803d'), accentDark: hexToOklch('#86efac'),
    neutral: hslToOklch({ h: 160, s: 10, l: 10 }),
    hierarchy: [hexToOklch('#15803d'), hexToOklch('#0f766e'), hexToOklch('#d97706')],
  },
  staff: { signInTitle: 'Sign in to MealLine', emailGuidance: 'Use your authorized staff email', emailPlaceholder: 'you@example.org' },
  capabilities: { publicInventory: true },
  terminology: { pantrySingular: 'food pantry', pantryPlural: 'food pantries', clientSingular: 'household', clientPlural: 'households', departmentName: 'Food Access', active: true },
};
// Keep the upstream export name for its existing imports and extension contracts.
export const WTH_BRAND_CONFIG = NOURISH_BRAND_CONFIG;
export const BRAND_TEMPLATES = [{ id: 'template-nourish', payload: NOURISH_BRAND_CONFIG }] as const;
