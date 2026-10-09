// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

// Load environment before any other imports
import './bootstrap';

// Force sync of configuration
import './services/sync';

// Initialize the storage service first
import { storageService } from './services/storage';

import { createNourishServer } from './nourish-server';
import './services/translation-trigger';
import { startDataImportStagingSweeper } from './services/data-import/staging-sweeper';
import { failOrphanedDataImportJobs } from './services/data-import/background';

// A crash used to leave nothing behind. Docker restarts the container
// (`restart: unless-stopped`), so by the time anyone looks the process is
// healthy again and the outage is invisible -- which is precisely what made a
// restart worth ruling out while diagnosing ISSUES.md #80, and what cost time
// there. Node's default for either of these is to print and exit; that exit is
// deliberate here too (a process with a broken invariant should not keep
// serving), but it now announces itself first so `docker logs` says which
// request was in flight.
process.on('unhandledRejection', (reason) => {
  console.error('[Fatal] Unhandled promise rejection -- exiting', reason);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('[Fatal] Uncaught exception -- exiting', err);
  process.exit(1);
});

const initializeServices = async () => {
  try {
    await storageService.initialize();
    console.log('Storage service initialized');

    // Import work runs detached from its HTTP request, so a process that stops
    // mid-run leaves its job in a background status that nothing will ever
    // advance. Fail those before serving, or a polling client waits forever on
    // progress that is not coming. See ISSUES.md #67.
    const orphaned = await failOrphanedDataImportJobs();
    if (orphaned.failed > 0) {
      console.log(`Failed ${orphaned.failed} data import job(s) interrupted by a restart`);
    }

    // Expired staged import bytes are PII and must not outlive their documented
    // 24-hour window. The sweep runs once now — collecting anything a previous
    // process left behind — and hourly thereafter. See ISSUES.md #69.
    startDataImportStagingSweeper();
    console.log('Data import staging sweeper started');
  } catch (err) {
    console.error('Failed to initialize services:', err);
    process.exit(1);
  }
};

initializeServices();

const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || '0.0.0.0';
const app = createNourishServer();

app.listen(port, host, () => {
  console.log(`Backend server running on ${host}:${port}`);
});
