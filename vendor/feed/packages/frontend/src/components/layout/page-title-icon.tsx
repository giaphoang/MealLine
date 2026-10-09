// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import * as React from "react";

// Shared "page-title icon" behavior, extracted from the AI Configuration
// page's PageTitleBotIcon. Wraps an imperative-ref animated icon
// (`@/components/ui/*` — exposes startAnimation/stopAnimation via ref) so the
// page title's icon:
//   - fires its animation once on mount (page load), drawing attention to the
//     section as it appears (ICON_ANIMATIONS.md Rule 4 page-title exception), and
//   - replays on hover.
// Used as a DataList `toolbarIcon`, which renders it via SectionHeader as
// `<Icon className="h-6 w-6 …" />` (no size prop — the icon's own default
// size applies).

export interface PageTitleIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

type ImperativeAnimatedIcon = React.ForwardRefExoticComponent<
  React.HTMLAttributes<HTMLDivElement> & { size?: number } & React.RefAttributes<PageTitleIconHandle>
>;

export function createPageTitleIcon(Icon: ImperativeAnimatedIcon) {
  return function PageTitleIcon({ className, size }: { className?: string; size?: number }) {
    const iconRef = React.useRef<PageTitleIconHandle>(null);
    React.useEffect(() => {
      iconRef.current?.startAnimation();
    }, []);
    return (
      <Icon
        ref={iconRef}
        className={className}
        size={size}
        onMouseEnter={() => iconRef.current?.startAnimation()}
        onMouseLeave={() => iconRef.current?.stopAnimation()}
      />
    );
  };
}
