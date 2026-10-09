// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

declare global {
  namespace Express {
    interface Request {
      // Populated by jwtAuthMiddleware from a per-request database read, not
      // from the JWT payload. Role and access state must be current: a token
      // lives seven days, so a demotion or revocation carried in the claims
      // would not take effect until the token expired.
      auth?: {
        userId: string;
        email: string;
        role: string;
        accessState: string;
      };
    }
  }
}

export {};
