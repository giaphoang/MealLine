// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Router } from 'express';
import { NextFunction, Request, Response } from 'express';
import { alertEventEmitter } from '../../services/events/alert-events';
import { alertService } from '../../services/alerts';
import prisma from '../../db';

const router = Router();

/**
 * GET /api/alerts/stream
 * Server-Sent Events endpoint for real-time alerts
 */
router.get('/stream', (req: Request, res: Response) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  res.flushHeaders();
  res.write(': connected\n\n');

  // Send initial data
  const sendInitialData = async () => {
    try {
      const [alerts, unreadCount] = await Promise.all([
        prisma.alert.findMany({
          orderBy: { createdAt: 'desc' },
          take: 20
        }),
        prisma.alert.count({ where: { isRead: false } })
      ]);
      
      res.write(`data: ${JSON.stringify({ type: 'initial', alerts, unreadCount })}\n\n`);
    } catch (error) {
      console.error('Error sending initial alert data:', error);
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to load initial data' })}\n\n`);
    }
  };
  sendInitialData();

  const keepalive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 30000);

  // Handle new alerts
  const newAlertHandler = (alert: any) => {
    res.write(`data: ${JSON.stringify({ type: 'new', alert })}\n\n`);
  };

  // Handle alert updates
  const updateAlertHandler = (alert: any) => {
    res.write(`data: ${JSON.stringify({ type: 'update', alert })}\n\n`);
  };

  // Subscribe to events
  alertEventEmitter.on('newAlert', newAlertHandler);
  alertEventEmitter.on('alertUpdate', updateAlertHandler);

  // Cleanup on client disconnect
  req.on('close', () => {
    clearInterval(keepalive);
    alertEventEmitter.off('newAlert', newAlertHandler);
    alertEventEmitter.off('alertUpdate', updateAlertHandler);
  });
});

/**
 * GET /api/alerts
 * Returns alerts, optionally filtered and paginated
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit = 20, unreadOnly = false } = req.query;
    const parsedLimit = Math.min(Number(limit) || 20, 100); // Cap at 100

    const alerts = await prisma.alert.findMany({
      where: unreadOnly ? { isRead: false } : undefined,
      orderBy: {
        createdAt: 'desc'
      },
      take: parsedLimit
    });

    const unreadCount = await prisma.alert.count({
      where: { isRead: false }
    });

    res.json({ alerts, unreadCount });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/alerts/unread-count
 * Returns count of unread alerts
 */
router.get('/unread-count', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const count = await prisma.alert.count({
      where: { isRead: false }
    });
    res.json({ count });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/alerts/:id/read
 * Marks a single alert as read
 */
router.put('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid alert ID' });
    }

    await alertService.markAsRead(id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/alerts/read-all
 * Marks all alerts as read
 */
router.put('/read-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await alertService.markAllAsRead();
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/alerts/cleanup
 * Removes alerts older than 30 days that have been read
 */
router.delete('/cleanup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await prisma.alert.deleteMany({
      where: {
        isRead: true,
        createdAt: {
          lt: thirtyDaysAgo
        }
      }
    });

    res.json({ 
      message: `Deleted ${result.count} old alerts`,
      count: result.count 
    });
  } catch (error) {
    next(error);
  }
});

export default router;
