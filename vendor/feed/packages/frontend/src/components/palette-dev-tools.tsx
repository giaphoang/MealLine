// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * TEMPORARY — the single dev-only entry point for the Tailwind palette work.
 *
 * `RootLayout` reaches it through a lazy import guarded by `import.meta.env.DEV`,
 * which Vite folds to `false` in a production build, so the whole subtree —
 * including the 288-entry candidate JSON — is dropped from the bundle rather
 * than merely hidden at runtime.
 *
 * The A/B switcher that used to live here is gone: index.css now holds the
 * palette references, so toggling compared the migrated appearance against
 * itself.
 *
 * A plain `if (!import.meta.env.DEV) return null` inside each component was not
 * enough: it hides the interface while the imports still ship.
 *
 * Delete this file, palette-calibration.tsx,
 * src/styles/tailwind-ab-candidates.json, the lazy mount in root-layout.tsx,
 * and packages/backend/scripts/generate-palette-candidates.ts together.
 */

import { PaletteCalibration } from '@/components/palette-calibration';

export default function PaletteDevTools() {
  return (
    <PaletteCalibration />
  );
}
