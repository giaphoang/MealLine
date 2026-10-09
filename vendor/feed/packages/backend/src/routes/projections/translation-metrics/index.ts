// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Router } from 'express';
import { NextFunction, Request, Response } from 'express';
import { TranslationAggregator } from '../../../services/dashboard';

const router = Router();

/**
 * GET /api/projections/translation-metrics
 * Returns comprehensive translation performance and usage metrics
 * 
 * Query Parameters:
 * - timeRange?: string ('1d', '7d', '30d', '365d', 'all-time')
 */
router.get('/translation-metrics', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { timeRange } = req.query;
    
    const aggregator = new TranslationAggregator();
    const result = await aggregator.getTranslationMetrics(timeRange as string);
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
