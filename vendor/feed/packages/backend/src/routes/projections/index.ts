// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Router } from 'express';
import { NextFunction, Request, Response } from 'express';
import { projectionService } from '../../services/projections';
import tokenMetricsRouter from './token-metrics';
import multiServiceMetricsRouter from './multi-service-metrics';
import dashboardOverviewRouter from './dashboard-overview';
import categoryDistributionRouter from './category-distribution';
import inventoryDistributionRouter from './inventory-distribution';
import translationMetricsRouter from './translation-metrics';

const router = Router();

// Include token metrics router
router.use(tokenMetricsRouter);

// Include multi-service metrics router
router.use(multiServiceMetricsRouter);

// Include dashboard aggregation routers
router.use(dashboardOverviewRouter);
router.use(categoryDistributionRouter);
router.use(inventoryDistributionRouter);
router.use(translationMetricsRouter);

/**
 * GET /api/projections/costs
 * Returns complete cost analysis including projections, stats, and optimization suggestions
 */
router.get('/costs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const days = Math.min(Number(req.query.days) || 30, 90); // Cap at 90 days
    
    // Fetch all required data concurrently
    const [projectionResult, stats, suggestions] = await Promise.all([
      projectionService.projectCosts(days),
      projectionService.getUsageStats(days),
      projectionService.suggestOptimizations()
    ]);
    const { projections, isCostFree, hasUsageData } = projectionResult;
    
    res.json({ projections, stats, suggestions, isCostFree, hasUsageData });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/projections/stats
 * Returns usage statistics and metrics
 */
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const days = Math.min(Number(req.query.days) || 30, 90);
    const stats = await projectionService.getUsageStats(days);
    res.json({ stats });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/projections/optimizations
 * Returns cost optimization suggestions
 */
router.get('/optimizations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const suggestions = await projectionService.suggestOptimizations();
    res.json({ suggestions });
  } catch (error) {
    next(error);
  }
});

export default router;
