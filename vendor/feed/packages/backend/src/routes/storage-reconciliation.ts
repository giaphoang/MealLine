// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import express from 'express';
import { storageReconciliationService } from '../services/storage/reconciliation';
import { SUPPORT_CONTACT_SENTENCE } from '../lib/support';

const router = express.Router();

/**
 * Manually trigger a full storage reconciliation
 */
router.post('/full-scan', async (req, res, next) => {
  try {
    console.log('Full storage reconciliation requested');
    
    // Run the full reconciliation process
    const result = await storageReconciliationService.fullReconciliation();
    const safeResult = result || { reconciled: false, actions: [], remainingIssues: [] as string[] };
    
    // Return results with more descriptive status message
    res.json({
      status: safeResult.reconciled ? 'success' : 'partial',
      message: safeResult.remainingIssues.length === 0 ? 
        'Storage reconciliation completed with no issues found' : 
        `Storage reconciliation completed with ${safeResult.remainingIssues.length} issues`,
      actionsCount: safeResult.actions.length,
      actions: safeResult.actions,
      issuesCount: safeResult.remainingIssues.length,
      issues: safeResult.remainingIssues
    });
  } catch (error) {
    console.error('Error in full storage reconciliation:', error);
    const friendlyError = new Error(`There was a problem verifying your storage files. Please try again later. ${SUPPORT_CONTACT_SENTENCE}`);
    (friendlyError as any).statusCode = 500;
    next(friendlyError);
  }
});

/**
 * Trigger reconciliation for a specific date range
 */
router.post('/date-range', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.body;
    
    if (!startDate) {
      return res.status(400).json({ error: 'Please select a start date for the reconciliation scan.' });
    }
    
    // Default to startDate if endDate is not provided
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : start;
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Please use a valid date format (YYYY-MM-DD).' });
    }
    
    console.log(`Storage reconciliation requested for date range: ${start.toISOString()} to ${end.toISOString()}`);
    
    // Trigger the reconciliation for the date range
    const result = await storageReconciliationService.reconcileDateRange(start, end);
    const safeResult = result || { reconciled: false, actions: [], remainingIssues: [] as string[] };
    
    // Return results with more descriptive status message
    res.json({
      status: safeResult.reconciled ? 'success' : 'partial',
      message: safeResult.remainingIssues.length === 0 ? 
        'Storage reconciliation completed with no issues found' : 
        `Storage reconciliation completed with ${safeResult.remainingIssues.length} issues`,
      actionsCount: safeResult.actions.length,
      actions: safeResult.actions,
      issuesCount: safeResult.remainingIssues.length,
      issues: safeResult.remainingIssues
    });
  } catch (error) {
    console.error('Error in date range storage reconciliation:', error);
    const friendlyError = new Error(`There was a problem verifying your files for the selected dates. Please try a smaller date range. ${SUPPORT_CONTACT_SENTENCE}`);
    (friendlyError as any).statusCode = 500;
    next(friendlyError);
  }
});

export default router;
