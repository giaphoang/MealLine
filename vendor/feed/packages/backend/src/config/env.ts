// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

// Ensure we import bootstrap first to load environment
import '../bootstrap';

// Define and export all environment variables
const ENV = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 3001,
  STORAGE_PATH: process.env.STORAGE_PATH || './storage',
} as const;

// Export individual values
export const STORAGE_PATH = ENV.STORAGE_PATH;