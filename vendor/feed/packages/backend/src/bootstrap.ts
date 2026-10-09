// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import dotenv from 'dotenv';

// Load environment variables before any other imports
dotenv.config();

// Log environment state
console.log('Environment initialized:', {
  NODE_ENV: process.env.NODE_ENV,
  AUTH_ENABLED: process.env.AUTH_USERNAME && process.env.AUTH_PASSWORD ? 'yes' : 'no',
  FORCE_AUTH: process.env.FORCE_AUTH === 'true' ? 'yes' : 'no',
  STORAGE_PATH: process.env.STORAGE_PATH || './storage'
});
