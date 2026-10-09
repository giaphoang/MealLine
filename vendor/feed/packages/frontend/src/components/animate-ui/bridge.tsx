// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client";

import * as React from "react";

import { useAnimateIconContext } from "@/components/animate-ui/icons/icon";

interface ControlledIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface BridgedAnimatedIconProps<H extends ControlledIconHandle> {
  /**
   * The imperative-ref icon component (e.g. CartIcon, FileTextIcon, etc.).
   * Must accept a ref exposing { startAnimation, stopAnimation }.
   */
  icon: React.ForwardRefExoticComponent<
    React.RefAttributes<H> & { size?: number; className?: string }
  >;
  size?: number;
  className?: string;
  [key: string]: unknown;
}

/**
 * Bridges an imperative-ref animated icon (lucide-animated style) to a parent
 * <AnimateIcon> context. When the parent activates (mount / hover / tap), this
 * wrapper calls startAnimation on the icon's ref. When it deactivates, it
 * calls stopAnimation. Lets imperative icons live alongside animate-ui icons
 * inside the same parent-driven animation flow without each icon listening
 * to its own mouseenter.
 */
export function BridgedAnimatedIcon<H extends ControlledIconHandle>({
  icon: Icon,
  size,
  className,
  ...props
}: BridgedAnimatedIconProps<H>) {
  const { active, runId } = useAnimateIconContext();
  const ref = React.useRef<H>(null);
  const lastSignalRef = React.useRef<string | undefined>(undefined);

  React.useEffect(() => {
    const signal = `${active ? 'active' : 'idle'}:${runId}`;
    if (signal === lastSignalRef.current) return;
    lastSignalRef.current = signal;
    if (active) ref.current?.startAnimation();
    else ref.current?.stopAnimation();
  }, [active, runId]);

  return (
    <Icon
      ref={ref}
      size={size}
      className={className}
      data-feed-animated-icon="true"
      data-feed-no-icon-motion="true"
      {...props}
    />
  );
}
