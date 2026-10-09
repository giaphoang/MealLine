// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client";

import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

// Imperative-ref animated variant of Lucide's `bell-dot` — the "new alerts"
// state of the alert button. The whole bell shakes (rotate + jitter) to draw
// attention when unread alerts spawn, and replays on hover. Shake style
// adapted from the `bell-electric` animate-ui example. Geometry is Lucide
// v0.522.0 `bell-dot` verbatim. See docs/motion/ICON_ANIMATIONS.md.

export interface BellDotIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface BellDotIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  // Play the shake once when the icon mounts (i.e. when the "new alerts"
  // state first appears, including on page load). Self-contained so it does
  // not depend on a parent ref being attached in time.
  animateOnMount?: boolean;
}

const BellDotIcon = forwardRef<BellDotIconHandle, BellDotIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, animateOnMount = false, ...props }, ref) => {
    const controls = useAnimation();
    const isControlledRef = useRef(false);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;
      return {
        startAnimation: () => controls.start("animate"),
        stopAnimation: () => controls.start("normal"),
      };
    });

    useEffect(() => {
      if (animateOnMount) controls.start("animate");
      // Run once on mount only.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleMouseEnter = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) onMouseEnter?.(e);
        else controls.start("animate");
      },
      [controls, onMouseEnter],
    );
    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) onMouseLeave?.(e);
        else controls.start("normal");
      },
      [controls, onMouseLeave],
    );

    return (
      <div
        className={cn(className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        <motion.svg
          animate={controls}
          fill="none"
          height={size}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          style={{ transformBox: "fill-box", transformOrigin: "50% 10%" }}
          transition={{ duration: 0.9 }}
          variants={{
            normal: { rotate: 0, translateX: 0, translateY: 0 },
            animate: {
              rotate: [0, -12, 12, -8, 8, -4, 4, 0],
              translateX: [0, -1.5, 1.5, -1, 1, 0],
              translateY: [0, -1, 1, -0.5, 0.5, 0],
            },
          }}
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M10.268 21a2 2 0 0 0 3.464 0" />
          <path d="M13.916 2.314A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.74 7.327A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673 9 9 0 0 1-.585-.665" />
          {/* alert dot — pulses with the shake */}
          <motion.circle
            animate={controls}
            cx="18"
            cy="8"
            r="3"
            style={{ transformBox: "fill-box", transformOrigin: "50% 50%" }}
            transition={{ duration: 0.75 }}
            variants={{
              normal: { scale: 1 },
              animate: { scale: [1, 1.25, 0.95, 1.15, 1] },
            }}
          />
        </motion.svg>
      </div>
    );
  },
);

BellDotIcon.displayName = "BellDotIcon";

export { BellDotIcon };
