// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Deployment capabilities — what this installation *does*, as distinct from
 * what it looks like.
 *
 * These began life inside the appearance payload, ported from LOTTO where the
 * inventory toggle genuinely is optional (a queue-only agency has no FEED at
 * all). In FEED the public inventory feed is FEED's own feature, so the toggle
 * is an operational data-sharing decision that was sitting in a branding form.
 * Worse, an appearance-scoped flag was unreachable whenever the compiled
 * default was active, because that path has no stored row to edit.
 *
 * Storing it here makes it administrator-owned, editable without touching an
 * appearance, and answerable while FEED runs its built-in identity.
 */

import prisma from '../../db';

export type DeploymentSettings = {
  publicInventoryEnabled: boolean;
  updatedBy: string | null;
  updatedAt: Date | null;
};

/**
 * Defaults match the behaviour FEED shipped before this table existed, so an
 * un-migrated or unreachable database keeps serving the public feed rather than
 * silently withdrawing it — the more surprising of the two failure directions,
 * since LOTTO reads this endpoint.
 */
export const DEFAULT_DEPLOYMENT_SETTINGS: DeploymentSettings = {
  publicInventoryEnabled: true,
  updatedBy: null,
  updatedAt: null,
};

export const getDeploymentSettings = async (): Promise<DeploymentSettings> => {
  try {
    const row = await prisma.deploymentSettings.findUnique({ where: { id: 'singleton' } });
    if (!row) return DEFAULT_DEPLOYMENT_SETTINGS;
    return {
      publicInventoryEnabled: row.publicInventoryEnabled,
      updatedBy: row.updatedBy,
      updatedAt: row.updatedAt,
    };
  } catch (error) {
    console.error('[DeploymentSettings] Falling back to defaults:', error);
    return DEFAULT_DEPLOYMENT_SETTINGS;
  }
};

export const updateDeploymentSettings = async (
  changes: { publicInventoryEnabled?: boolean },
  updatedBy: string | null,
): Promise<DeploymentSettings> => {
  const row = await prisma.deploymentSettings.upsert({
    where: { id: 'singleton' },
    create: {
      id: 'singleton',
      publicInventoryEnabled: changes.publicInventoryEnabled ?? true,
      updatedBy,
    },
    update: { ...changes, updatedBy },
  });
  return {
    publicInventoryEnabled: row.publicInventoryEnabled,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt,
  };
};
