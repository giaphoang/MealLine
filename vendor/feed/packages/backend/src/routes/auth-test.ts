// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ResendService } from '../services/email/resend-service';
import { AccessPolicyService } from '../services/auth/access-policy-service';

const router = Router();

// Validation schemas
const emailSchema = z.object({
  email: z.string().email('Invalid email address')
});

/**
 * TEST ROUTE: Send magic link email
 * POST /api/auth/test/magic-link
 */
router.post('/magic-link', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validate request body
    const result = emailSchema.safeParse(req.body);
    
    if (!result.success) {
      const error = new Error('Please provide a valid email address') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    const { email } = result.data;

    await AccessPolicyService.assertMayAuthenticate(email);

    // Generate test token (in Stage 4, this will be proper cryptographic token)
    const testToken = 'test-token-' + Date.now();

    // Send email
    await ResendService.sendMagicLink(email, testToken);

    res.json({
      success: true,
      message: 'Magic link sent successfully',
      debug: {
        email,
        token: testToken,
        note: 'Check email for sign-in link'
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * TEST ROUTE: Send OTP code
 * POST /api/auth/test/otp
 */
router.post('/otp', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validate request body
    const result = emailSchema.safeParse(req.body);
    
    if (!result.success) {
      const error = new Error('Please provide a valid email address') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    const { email } = result.data;

    await AccessPolicyService.assertMayAuthenticate(email);

    // Generate test OTP (in Stage 4, this will be secure random code)
    const testCode = String(Math.floor(100000 + Math.random() * 900000));

    // Send email
    await ResendService.sendOTP(email, testCode);

    res.json({
      success: true,
      message: 'Verification code sent successfully',
      debug: {
        email,
        code: testCode,
        note: 'Check email for 6-digit code'
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
