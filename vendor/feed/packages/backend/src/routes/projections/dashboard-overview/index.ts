// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Router } from 'express';
import { NextFunction, Request, Response } from 'express';
import { OverviewAggregator } from '../../../services/dashboard';

const router = Router();

/**
 * GET /api/projections/dashboard-overview
 * Returns comprehensive overview metrics for all dashboard stats cards
 * 
 * Query Parameters:
 * - timeRange?: string ('1d', '7d', '30d', '365d', 'all-time')
 */
router.get('/dashboard-overview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { timeRange } = req.query;
    
    const aggregator = new OverviewAggregator();
    const result = await aggregator.getOverviewMetrics(timeRange as string);
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
