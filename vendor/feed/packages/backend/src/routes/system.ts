// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Router } from 'express';
import { NextFunction, Request, Response } from 'express';
import { SystemStatusService } from '../services/system';
import { KeyManager } from '../services/encryption/key-manager';

const router = Router();

/**
 * Get system initialization status (encryption key readiness)
 */
router.get('/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hasEncryptionKey = await KeyManager.hasActiveKey('api_encryption');

    res.json({
      initialized: hasEncryptionKey,
      components: {
        encryptionKey: hasEncryptionKey
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Initialize system with encryption key
 */
router.post('/initialize', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { encryptionKey } = req.body as { encryptionKey?: string };

    if (!encryptionKey || typeof encryptionKey !== 'string') {
      const error = new Error('Encryption key is required to initialize the system.') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    await KeyManager.initializeKey(encryptionKey, 'primary', 'api_encryption');

    res.json({
      message: 'System initialized successfully.',
      initialized: true
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get system startup status to distinguish between startup conditions and errors
 */
router.get('/startup-status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = await SystemStatusService.getStartupStatus();
    const description = SystemStatusService.getSystemStateDescription(status);
    
    res.json({
      ...status,
      description
    });
  } catch (error) {
    next(error);
  }
});

export default router;
