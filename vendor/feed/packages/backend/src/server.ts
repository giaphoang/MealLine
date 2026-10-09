// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.
import express from 'express';
import compression from 'compression';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import globalLimitRouter from './routes/global-limit';
import categoriesRouter from './routes/categories';
import foodItemsRouter from './routes/food-items';
import languagesRouter from './routes/languages';
import translationsRouter from './routes/translations';
import alertsRouter from './routes/alerts';
import projectionsRouter from './routes/projections';
import documentsRouter from './routes/documents';
import storageReconciliationRouter from './routes/storage-reconciliation';
import quarantineRouter from './routes/quarantine';
import customTextsRouter from './routes/custom-texts';
import shoppingListsRouter from './routes/shopping-lists';
import shoppingListBuilderRouter from './routes/shopping-list-builder';
import aiConfigRouter from './routes/ai-config';
import systemPromptsRouter from './routes/system-prompts';
import systemRouter from './routes/system';
import publicInventoryRouter from './routes/public-inventory';
import operationalReportsRouter from './routes/operational-reports';
import analyticsReportsRouter from './routes/analytics-reports';
import settingsRouter from './routes/settings';
import procurementRouter from './routes/procurement';
import dataImportRouter from './routes/data-import';
import serviceRouter from './routes/service';
import authTestRouter from './routes/auth-test';
import authRouter from './routes/auth';
import adminRouter from './routes/admin';
import brandRouter from './routes/brand';
import nourishRouter, { requireInternalToken } from './routes/nourish';
import { maintenanceGuard } from './services/restore/maintenance-mode';
import { errorHandler } from './middleware/error-handler';
import { jsonErrorHandler } from './middleware/json-error-handler';
import { authMiddleware, jwtAuthMiddleware } from './middleware/auth';
import { requireAdmin } from './middleware/auth/require-admin';
import { version } from '../package.json';

export const createServer = () => {
  const app = express();

  // Middleware
  const shouldCompress = (req: express.Request, res: express.Response) => {
    if (req.path === '/api/alerts/stream' || req.headers.accept?.includes('text/event-stream')) {
      return false;
    }
    return compression.filter(req, res);
  };

  app.use(compression({ threshold: 1024, filter: shouldCompress })); // Compress responses > 1KB

  // Public read-only inventory feed for external tools like LOTTO. This must
  // stay before the credentialed CORS and authentication middleware.
  app.use('/api/public', publicInventoryRouter);

  app.use(cors({
    origin: new URL(process.env.APP_URL || 'http://localhost:3003/feed').origin,
    credentials: true,
    exposedHeaders: ['Content-Disposition'],
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(jsonErrorHandler);

  // Add health check endpoint that bypasses authentication
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', version });
  });

  app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', version });
  });

  // Public identity/theme reads are needed before sign-in and before first
  // paint. All mutations remain administrator-only under /api/admin/brand.
  app.use('/api/brand', brandRouter);
  app.use('/api/nourish-internal', requireInternalToken, maintenanceGuard, nourishRouter);

  // Serve the built frontend before auth so static assets don't require credentials
  const distPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(distPath));
  app.get(/^(?!\/api(?:\/|$)|\/health$).*/, (req, res, next) => {
    return res.sendFile(path.join(distPath, 'index.html'));
  });

  // Add authentication middleware (before routes, after basic middleware)
  app.use(jwtAuthMiddleware);
  app.use(authMiddleware);

  // After authentication, so an unauthenticated caller still gets 401 first —
  // maintenance is not an authentication bypass. Refuses mutations with 503
  // while a restore swaps the database underneath the process; reads keep
  // working so staff can look things up while they wait.
  app.use(maintenanceGuard);

  // Routes
  app.use('/api/nourish', nourishRouter);
  app.use('/api/global-limit', globalLimitRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/food-items', foodItemsRouter);
  app.use('/api/reports', operationalReportsRouter);
  // Report generation for the Analytics lenses. Separate from /api/reports so
  // it cannot inherit the dormant registry's rejected claims (ISSUES #46).
  app.use('/api/analytics-reports', analyticsReportsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/procurement', procurementRouter);
  app.use('/api/data-import', dataImportRouter);
  app.use('/api/service', serviceRouter);
  app.use('/api/languages', languagesRouter);
  app.use('/api/translations', translationsRouter);
  app.use('/api/alerts', alertsRouter);
  app.use('/api/projections', projectionsRouter);
  app.use('/api/documents', documentsRouter);
  app.use('/api/storage-reconciliation', storageReconciliationRouter);
  app.use('/api/quarantine', quarantineRouter);
  app.use('/api/custom-texts', customTextsRouter);
  app.use('/api/shopping-lists', shoppingListsRouter);
  app.use('/api/shopping-list-builder', shoppingListBuilderRouter);
  app.use('/api/ai-config', aiConfigRouter);
  app.use('/api/system-prompts', systemPromptsRouter);
  app.use('/api/system', systemRouter);
  app.use('/api/auth/test', requireAdmin, authTestRouter);
  app.use('/api/auth', authRouter);
  // Administrator-only. The router applies `requireAdmin` to every route.
  app.use('/api/admin', adminRouter);

  // Error handling
  app.use(errorHandler);

  return app;
};

export default createServer;
