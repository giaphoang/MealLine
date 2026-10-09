// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Router } from 'express';
import { NextFunction, Request, Response } from 'express';
import { InventoryAggregator } from '../../../services/dashboard';

const router = Router();

/**
 * GET /api/projections/inventory-distribution
 * Returns comprehensive inventory status distribution and analysis
 * 
 * Query Parameters:
 * - timeRange?: string ('1d', '7d', '30d', '365d', 'all-time')
 */
router.get('/inventory-distribution', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { timeRange } = req.query;
    
    const aggregator = new InventoryAggregator();
    const result = await aggregator.getInventoryDistribution(timeRange as string);
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/projections/inventory-alerts
 * Returns inventory alerts based on stock levels and thresholds
 * 
 * Query Parameters:
 * - timeRange?: string ('1d', '7d', '30d', '365d', 'all-time')
 */
router.get('/inventory-alerts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { timeRange } = req.query;
    
    const aggregator = new InventoryAggregator();
    const result = await aggregator.getInventoryAlerts(timeRange as string);
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
