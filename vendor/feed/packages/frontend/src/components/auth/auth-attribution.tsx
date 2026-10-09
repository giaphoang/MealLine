// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { SquareTerminal } from '@/components/ui/icons';
import { APP_VERSION } from "@/config/app-version";
import { useBrand } from '@/contexts/BrandContext';

interface AuthAttributionProps {
  className?: string;
  showSourceLink?: boolean;
}

const linkClassName =
  "font-medium text-foreground underline-offset-4 transition-colors hover:underline";

export function AuthAttribution({
  className = "",
  showSourceLink = true,
}: AuthAttributionProps) {
  const brand = useBrand();
  return (
    <div className={`space-y-2 text-center text-xs text-muted-foreground ${className}`}>
      <p>Version {APP_VERSION}</p>
      <p>
        Made by{" "}
        <a
          href="https://www.geigertron.com/"
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
        >
          Matt Geiger
        </a>
        {", "}
        <a
          href="https://templepdx.com/"
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
        >
          Temple Consulting, LLC.
        </a>{" "}
        2025-2026
      </p>
      <p>
        Made for{" "}
        <a
          href={brand.identity.organizationWebsite}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
        >
          {brand.identity.organizationName}
        </a>
      </p>
      {showSourceLink ? (
        <a
          href="/source"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1 font-medium text-foreground underline-offset-4 transition-colors hover:underline"
        >
          <SquareTerminal className="h-3.5 w-3.5" aria-hidden="true" />
          Download MealLine Source Code
        </a>
      ) : null}
    </div>
  );
}
