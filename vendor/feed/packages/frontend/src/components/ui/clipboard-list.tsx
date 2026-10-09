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

// Imperative-ref animated variant of Lucide's `clipboard-list` (the
// `@/components/animate-ui` clipboard-list is the native/context-driven
// variant; this is the ref-driven one used as a page-title icon, which fires
// on mount + hover). The list rows stagger in top-to-bottom; the clipboard
// body and clip stay put. Geometry is Lucide v0.522.0 verbatim.

export interface ClipboardListIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface ClipboardListIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const ROW_VARIANTS: Variants = {
  normal: { opacity: 1, x: 0 },
  animate: (i: number) => ({
    opacity: [0, 1],
    x: [-3, 0],
    transition: { delay: i * 0.12, duration: 0.35, ease: "easeOut" },
  }),
};

const ClipboardListIcon = forwardRef<ClipboardListIconHandle, ClipboardListIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
    const controls = useAnimation();
    const isControlledRef = useRef(false);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;
      return {
        startAnimation: () => controls.start("animate"),
        stopAnimation: () => controls.start("normal"),
      };
    });

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
          {/* clipboard body + clip (static) */}
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
          {/* row 1 — bullet + line */}
          <motion.path animate={controls} custom={0} d="M8 11h.01" initial="normal" variants={ROW_VARIANTS} />
          <motion.path animate={controls} custom={0} d="M12 11h4" initial="normal" variants={ROW_VARIANTS} />
          {/* row 2 — bullet + line */}
          <motion.path animate={controls} custom={1} d="M8 16h.01" initial="normal" variants={ROW_VARIANTS} />
          <motion.path animate={controls} custom={1} d="M12 16h4" initial="normal" variants={ROW_VARIANTS} />
        </svg>
      </div>
    );
  },
);

ClipboardListIcon.displayName = "ClipboardListIcon";

export { ClipboardListIcon };
