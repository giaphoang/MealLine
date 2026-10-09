// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Router } from 'express';
import { NextFunction, Request, Response } from 'express';
import { rateLimiter } from '../middleware/rate-limiter';
import prisma from '../db';
import { SUPPORT_CONTACT_SENTENCE } from '../lib/support';

const router = Router();

// Custom error types
class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
  statusCode: number;
}

class TransactionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransactionError';
    this.statusCode = 500;
    this.code = 'TRANSACTION_FAILED';
  }
  statusCode: number;
  code: string;
}

// Validate limit value
const validateLimit = (limit: any): number => {
  if (limit === undefined || limit === null) {
    throw new ValidationError('Please enter a limit value to continue');
  }

  // Handle string input
  const parsedLimit = typeof limit === 'string' ? parseFloat(limit) : limit;
  
  // Validate number type and NaN
  if (typeof parsedLimit !== 'number' || isNaN(parsedLimit)) {
    throw new ValidationError('Please enter a valid number for the limit');
  }

  // Validate integer
  if (!Number.isInteger(parsedLimit)) {
    throw new ValidationError('Please enter a whole number for the limit');
  }

  // Validate range
  if (parsedLimit < 1 || parsedLimit > 100) {
    throw new ValidationError('Please enter a limit between 1 and 100');
  }

  return parsedLimit;
};

// GET current global limit
router.get('/', rateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = await prisma.globalLimit.findFirst();
    res.json({
      success: true,
      data: {
        limit: limit?.value ?? 10
      }
    });
  } catch (error) {
    const txError = new TransactionError(`We couldn't retrieve the current limit. Please try again. ${SUPPORT_CONTACT_SENTENCE}`);
    next(txError);
  }
});

// Update global limit
router.put('/', rateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validate input
    let numLimit: number;
    try {
      numLimit = validateLimit(req.body.limit);
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({
          error: {
            message: error.message,
            timestamp: new Date().toISOString()
          }
        });
      }
      throw error;
    }

    // Use transaction for atomicity
    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.globalLimit.findFirst();
      
      if (current?.value === numLimit) {
        return current;
      }

      return await tx.globalLimit.upsert({
        where: { id: 1 },
        update: { value: numLimit },
        create: { value: numLimit }
      });
    });

    res.json({
      success: true,
      data: {
        limit: updated.value,
        timestamp: updated.updatedAt.toISOString()
      }
    });
  } catch (error) {
    const txError = new TransactionError(`We couldn't save your changes to the limit. Please try again. ${SUPPORT_CONTACT_SENTENCE}`);
    next(txError);
  }
});

export = router;