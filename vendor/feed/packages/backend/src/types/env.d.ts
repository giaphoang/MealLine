// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'production' | 'test';
      HOST?: string;
      PORT?: string;

      // Database Configuration
      DATABASE_URL: string;

      // Storage
      STORAGE_PATH?: string;

      // JWT Authentication
      JWT_SECRET?: string;
      JWT_EXPIRES_IN?: string;

      // Email (Resend)
      RESEND_API_KEY?: string;
      EMAIL_FROM?: string;

      // Application URLs
      APP_URL?: string;
      COOKIE_DOMAIN?: string;

      // Auth controls
      FORCE_AUTH?: string;
      AUTH_USERNAME?: string;
      AUTH_PASSWORD?: string;
    }
  }
}

export {};
