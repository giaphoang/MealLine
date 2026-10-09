// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { z } from 'zod';

export const BRAND_CONFIG_SCHEMA_VERSION = 1;

export const oklchColorSchema = z.object({
  l: z.number().min(0).max(1),
  c: z.number().min(0).max(0.4),
  h: z.number().min(0).max(360),
});

const cleanLine = (maximum: number) => z.string().trim().min(1).max(maximum)
  .refine((value) => !/[\x00-\x1f\x7f]/.test(value), 'Control characters are not allowed.');

const optionalFamily = z.string().regex(/^[a-z]+$/).max(24).optional();

export const brandAssetReferenceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('builtin'),
    src: z.string().startsWith('/').max(300),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal('database'),
    id: z.string().uuid(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    // Optional so configurations saved before vector preservation remain valid.
    mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']).optional(),
    // Likewise optional: shown in the wizard so an operator can see which file
    // is in each slot. Already sanitised by `safeFilename` on the way in.
    filename: z.string().max(160).optional(),
  }),
]);

export const brandConfigSchema = z.object({
  schemaVersion: z.literal(BRAND_CONFIG_SCHEMA_VERSION),
  identity: z.object({
    organizationName: cleanLine(120),
    appName: cleanLine(80),
    /**
     * Retained so configurations saved before this still parse, and ignored.
     *
     * "Food Equity & Efficient Delivery" is not a strapline an agency writes —
     * it spells FEED. Letting it be edited invited someone to replace the
     * expansion of the product's own name with their own words, leaving the
     * acronym meaningless. `FEED_TAGLINE` is served regardless of what a
     * stored payload holds.
     */
    tagline: cleanLine(160).optional(),
    description: cleanLine(300),
    organizationWebsite: z.string().url().refine((value) => /^https?:\/\//.test(value), {
      message: 'Use an http(s) organization website.',
    }),
  }),
  logo: z.object({
    light: brandAssetReferenceSchema,
    dark: brandAssetReferenceSchema,
    square: brandAssetReferenceSchema.optional(),
    squareDerivatives: z.object({
      size64: brandAssetReferenceSchema,
      size192: brandAssetReferenceSchema,
      size512: brandAssetReferenceSchema,
    }).optional(),
    /**
     * How the light-mode logo has to sit on the page.
     *
     * Plenty of logos are drawn in white on a transparent ground, for placing
     * over photography. Dropped straight onto FEED's light surface they vanish.
     * `dark-surface` gives the mark its own dark plate in light mode; in dark
     * mode the page is already dark, so the plate is dropped and the mark sits
     * directly on the background. Matches LOTTO's `logo.presentation`, so a
     * staff member who has set this there recognises it here.
     */
    presentation: z.enum(['transparent', 'dark-surface']).default('transparent'),
  }),
  colors: z.object({
    accent: oklchColorSchema,
    accentDark: oklchColorSchema.optional(),
    neutral: oklchColorSchema.optional(),
    hierarchy: z.array(oklchColorSchema).min(1).max(5),
    accentFamily: optionalFamily,
    accentDarkFamily: optionalFamily,
    neutralFamily: optionalFamily,
  }),
  staff: z.object({
    signInTitle: cleanLine(120),
    emailGuidance: cleanLine(200),
    emailPlaceholder: cleanLine(120),
  }),
  /**
   * @deprecated Superseded by the `DeploymentSettings` table. Nothing reads
   * this any more — whether the public inventory feed is served is a deployment
   * capability owned by administrators in Data Management, not brand identity,
   * and an appearance-scoped flag was unreachable while the compiled default
   * was active. Retained (and still written by the wizard's defaults) so saved
   * configurations and portable backups keep their shape; remove once no stored
   * payload carries it.
   */
  capabilities: z.object({
    publicInventory: z.boolean(),
  }),
  // Terminology is a display-only vocabulary. Counting nouns remain absent;
  // `household`, `visit`, and `person served` cannot be renamed by this schema.
  terminology: z.object({
    pantrySingular: cleanLine(60),
    pantryPlural: cleanLine(60),
    clientSingular: cleanLine(60),
    clientPlural: cleanLine(60),
    departmentName: cleanLine(100),
    active: z.boolean().default(true),
  }).optional(),
});

export type BrandConfig = z.infer<typeof brandConfigSchema>;
export type BrandAssetReference = z.infer<typeof brandAssetReferenceSchema>;

export const parseBrandConfig = (payload: unknown):
  | { ok: true; config: BrandConfig }
  | { ok: false; errors: string[] } => {
  const parsed = brandConfigSchema.safeParse(payload);
  if (parsed.success) return { ok: true, config: parsed.data };
  return {
    ok: false,
    errors: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
  };
};
