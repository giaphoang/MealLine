// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React from 'react';

export function SkipNav() {
  return (
    <a
      href="#main-content"
      className="
        sr-only focus:not-sr-only
        focus:fixed focus:top-4 focus:left-4
        focus:z-50
        focus:px-4 focus:py-2
        focus:bg-background
        focus:border-2 focus:border-ring
        focus:rounded-md
        focus:outline-hidden
        focus:shadow-lg
      "
    >
      Skip to main content
    </a>
  );
}