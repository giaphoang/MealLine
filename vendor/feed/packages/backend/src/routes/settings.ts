// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { Router } from 'express';
import { ZodError } from 'zod';
import { rateLimiter } from '../middleware/rate-limiter';
import {
  getOperatingHoursSettings,
  saveOperatingHoursSettings,
} from '../services/operating-hours';

const router = Router();

router.get('/operating-hours', rateLimiter, async (_req, res, next) => {
  try {
    res.json({ settings: await getOperatingHoursSettings() });
  } catch (error) {
    next(error);
  }
});

router.put('/operating-hours', rateLimiter, async (req, res, next) => {
  try {
    res.json({ settings: await saveOperatingHoursSettings(req.body) });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: {
          message: error.issues[0]?.message ?? 'Check the operating hours and try again.',
          code: 'INVALID_OPERATING_HOURS',
          details: error.issues,
        },
      });
    }
    next(error);
  }
});

export default router;
