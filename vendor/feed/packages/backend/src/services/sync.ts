// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import '../bootstrap';

// Force early initialization of limits and rates.
//
// A commented-out debug `console.log` sat here referencing MODEL_NAME,
// TOKEN_RATES and TOKEN_LIMITS. Those were this file's only mention of them,
// so the import existed solely to satisfy a comment — and it has been
// removed. The block goes with it: left in place it would have read as an
// instruction ("uncomment for debugging") that no longer compiles.
