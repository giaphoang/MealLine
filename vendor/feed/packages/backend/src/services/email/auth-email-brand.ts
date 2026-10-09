// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import prisma from '../../db';
import { assetUrl, printBrand } from '../brand-config';
import { FEED_TAGLINE } from '../brand-config/presets';

export type EmailBrand = {
  organizationName: string;
  appName: string;
  tagline: string;
  organizationWebsite: string;
  logoUrl: string;
  colors: {
    blue: string; blueTint: string; gold: string; ink: string;
    body: string; muted: string; hairline: string; page: string; card: string;
  };
};

const absoluteUrl = (path: string) => {
  if (/^https?:\/\//.test(path)) return path;
  const base = process.env.APP_URL || 'http://localhost:3003/feed';
  return `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
};

/** Resolve email-safe light-scope literals from the same active brand input. */
/**
 * A raster URL for the email header, or null when the brand's logo is vector.
 *
 * Mail clients handle SVG badly — Gmail strips `<img src="*.svg">` outright and
 * Outlook will not render it — so an email must not embed one however good it
 * looks in the app. Returning null lets the caller fall back to the built-in
 * raster lockup rather than shipping a broken image.
 */
const rasterLogoUrl = async (
  reference: { kind: string; src?: string; id?: string },
): Promise<string | null> => {
  if (reference.kind === 'builtin') {
    return reference.src && !/\.svgx?$/i.test(reference.src) ? reference.src : null;
  }
  if (reference.kind === 'database' && reference.id) {
    try {
      const asset = await prisma.brandAsset.findUnique({
        where: { id: reference.id },
        select: { mimeType: true },
      });
      if (!asset || asset.mimeType === 'image/svg+xml') return null;
      return assetUrl(reference as never);
    } catch {
      return null;
    }
  }
  return null;
};

export const resolveEmailBrand = async (): Promise<EmailBrand> => {
  const resolved = await printBrand();
  const { config, colors } = resolved;
  const raster = await rasterLogoUrl(config.logo.light as never);
  return {
    organizationName: config.identity.organizationName,
    appName: config.identity.appName,
    tagline: FEED_TAGLINE,
    organizationWebsite: config.identity.organizationWebsite,
    // Empty string makes email-layout fall back to the built-in raster.
    logoUrl: raster ? absoluteUrl(raster) : '',
    colors: {
      blue: colors.primary,
      blueTint: colors.muted,
      gold: colors.accent,
      ink: colors.foreground,
      body: colors.foreground,
      muted: colors['muted-foreground'],
      hairline: colors.border,
      page: colors.background,
      card: colors.card,
    },
  };
};
