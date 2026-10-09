// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client";

import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface GlobeIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface GlobeIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

// In-place path tracing only: the outer circle and the two meridians fade in
// and grow along their length. No SVG-level rotation or translation.
const LINE_VARIANTS: Variants = {
  normal: { pathLength: 1, opacity: 1 },
  animate: (i: number) => ({
    pathLength: [0, 1],
    opacity: [0, 1],
    transition: {
      delay: i * 0.12,
      pathLength: { duration: 0.55, ease: "easeOut" },
      opacity: { duration: 0.15 },
    },
  }),
};

const GlobeIcon = forwardRef<GlobeIconHandle, GlobeIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
    const lineControls = useAnimation();
    const isControlledRef = useRef(false);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;
      return {
        startAnimation: () => lineControls.start("animate"),
        stopAnimation: () => lineControls.start("normal"),
      };
    });

    const handleMouseEnter = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) onMouseEnter?.(e);
        else lineControls.start("animate");
      },
      [lineControls, onMouseEnter],
    );
    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) onMouseLeave?.(e);
        else lineControls.start("normal");
      },
      [lineControls, onMouseLeave],
    );

    return (
      <div
        className={cn(className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        <svg
          fill="none"
          height={size}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <motion.circle
            animate={lineControls}
            custom={0}
            cx="12"
            cy="12"
            initial="normal"
            r="10"
            variants={LINE_VARIANTS}
          />
          <motion.path
            animate={lineControls}
            custom={1}
            d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"
            initial="normal"
            variants={LINE_VARIANTS}
          />
          <motion.path
            animate={lineControls}
            custom={2}
            d="M2 12h20"
            initial="normal"
            variants={LINE_VARIANTS}
          />
        </svg>
      </div>
    );
  },
);

GlobeIcon.displayName = "GlobeIcon";

export { GlobeIcon };
