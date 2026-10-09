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

export interface AppleIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface AppleIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const BODY_VARIANTS: Variants = {
  normal: { rotate: 0 },
  animate: {
    rotate: [0, -6, 6, -3, 3, 0],
    transition: { duration: 0.7, ease: "easeInOut" },
  },
};

const LEAF_VARIANTS: Variants = {
  normal: { rotate: 0, opacity: 1 },
  animate: {
    rotate: [0, -20, 0],
    opacity: [0, 1],
    transition: { delay: 0.05, duration: 0.5, ease: "easeOut" },
  },
};

const AppleIcon = forwardRef<AppleIconHandle, AppleIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
    const bodyControls = useAnimation();
    const leafControls = useAnimation();
    const isControlledRef = useRef(false);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;
      return {
        startAnimation: () => {
          bodyControls.start("animate");
          leafControls.start("animate");
        },
        stopAnimation: () => {
          bodyControls.start("normal");
          leafControls.start("normal");
        },
      };
    });

    const handleMouseEnter = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) onMouseEnter?.(e);
        else {
          bodyControls.start("animate");
          leafControls.start("animate");
        }
      },
      [bodyControls, leafControls, onMouseEnter],
    );
    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) onMouseLeave?.(e);
        else {
          bodyControls.start("normal");
          leafControls.start("normal");
        }
      },
      [bodyControls, leafControls, onMouseLeave],
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
          <motion.path
            animate={bodyControls}
            d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z"
            initial="normal"
            variants={BODY_VARIANTS}
            style={{ transformOrigin: "12px 14px" }}
          />
          <motion.path
            animate={leafControls}
            d="M10 2c1 .5 2 2 2 5"
            initial="normal"
            variants={LEAF_VARIANTS}
            style={{ transformOrigin: "10px 5px" }}
          />
        </svg>
      </div>
    );
  },
);

AppleIcon.displayName = "AppleIcon";

export { AppleIcon };
