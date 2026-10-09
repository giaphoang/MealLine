// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Router } from 'express';
import { NextFunction, Request, Response } from 'express';
import { CategoryAggregator } from '../../../services/dashboard';

const router = Router();

/**
 * GET /api/projections/category-distribution
 * Returns category distribution with item counts and percentage analysis
 * 
 * Query Parameters:
 * - timeRange?: string ('1d', '7d', '30d', '365d', 'all-time')
 * - minimumThreshold?: number (default: 1) - minimum items per category to include
 */
router.get('/category-distribution', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { timeRange, minimumThreshold } = req.query;
    
    const threshold = minimumThreshold ? parseInt(minimumThreshold as string, 10) : 1;
    
    const aggregator = new CategoryAggregator();
    const result = await aggregator.getCategoryDistribution(timeRange as string, threshold);
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/projections/category-trends
 * Returns category trend analysis comparing current and previous periods
 * 
 * Query Parameters:
 * - timeRange?: string ('1d', '7d', '30d', '365d', 'all-time')
 */
router.get('/category-trends', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { timeRange } = req.query;
    
    const aggregator = new CategoryAggregator();
    const result = await aggregator.getCategoryTrends(timeRange as string);
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
