// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import type { ReactNode } from 'react';

import { BrandLogo } from '@/components/brand-logo';
import { useBrand } from '@/contexts/BrandContext';

/**
 * The shared frame for every page reachable without a session: sign-in,
 * magic-link confirmation, and sign-out.
 *
 * These are the only three surfaces someone meets before or after they have an
 * account context, and they are frequently arrived at cold — from an email
 * link, or from a shared machine. They should look like one place.
 *
 * They did not. Each carried its own copy of the frame, so they drifted: two
 * had no logo at all, one named the product in hard-coded text that ignored
 * the configured app name, and the widths and spacing differed. Holding the
 * frame in one component is the point — matching them once and letting three
 * files keep matching by hand would only postpone the next divergence.
 *
 * The tagline is read from the brand rather than written here. It is served as
 * a fixed constant (it spells FEED), but going through the payload means this
 * component has no opinion about it.
 */
export function AuthPageShell({ children }: { children: ReactNode }) {
  const brand = useBrand();

  return (
    <div className="flex min-h-svh items-center justify-center bg-linear-to-br from-gray-50 to-gray-100 px-4 py-10 dark:from-gray-950 dark:to-gray-900">
      <div className="flex w-full max-w-lg flex-col items-center gap-8">
        <div className="space-y-5 text-center">
          <BrandLogo className="mx-auto h-auto w-72" />
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {brand.identity.tagline}
            </h1>
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}
