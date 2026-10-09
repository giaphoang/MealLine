// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

// Administrator-owned deployment capabilities. `requireAdmin` is applied to the
// whole /api/admin router, so these inherit it.

import { Router } from 'express';
import { z } from 'zod';

import { auditActorFrom } from '../../middleware/auth/require-admin';
import {
  getDeploymentSettings,
  updateDeploymentSettings,
} from '../../services/deployment-settings';

const router = Router();

const updateSchema = z.object({
  publicInventoryEnabled: z.boolean().optional(),
});

router.get('/', async (_req, res, next) => {
  try {
    return res.json({ settings: await getDeploymentSettings() });
  } catch (error) {
    return next(error);
  }
});

router.put('/', async (req, res, next) => {
  try {
    const parsed = updateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: {
          message: 'That setting could not be read. Refresh Data Management and try the change again.',
          code: 'DEPLOYMENT_SETTINGS_INVALID',
        },
      });
    }
    const actor = auditActorFrom(req);
    return res.json({
      settings: await updateDeploymentSettings(parsed.data, actor.label),
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
