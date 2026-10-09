// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import * as React from 'react';

/**
 * Point several refs at one node.
 *
 * Needed wherever a component both keeps an internal ref and accepts a
 * forwarded one — `Slot` and `AnimateIcon` each do. Assigning only one of them
 * is the silent failure: whichever consumer lost the race just reads `null`
 * forever, with nothing logged.
 *
 * Lives in `lib/` rather than beside either consumer so importing it does not
 * add a non-component export to a component module, which would cost that
 * module its Fast Refresh.
 */
export function mergeRefs<T>(
  ...refs: (React.Ref<T> | undefined)[]
): React.RefCallback<T> {
  return (node) => {
    refs.forEach((ref) => {
      if (!ref) return;
      if (typeof ref === 'function') {
        ref(node);
      } else {
        (ref as React.RefObject<T | null>).current = node;
      }
    });
  };
}
