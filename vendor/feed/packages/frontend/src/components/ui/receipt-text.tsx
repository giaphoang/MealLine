// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client";

import { motion, useAnimation, type Variants } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import { cn } from "@/lib/utils";

export interface ReceiptTextIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface ReceiptTextIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const LINES_CONTAINER_VARIANTS: Variants = {
  visible: {
    transition: { staggerChildren: 0.1, delayChildren: 0 },
  },
  hidden: {
    transition: { staggerChildren: 0.06, staggerDirection: -1 },
  },
};

const LINE_VARIANTS: Variants = {
  visible: {
    pathLength: 1,
    opacity: 1,
    transition: { duration: 0.35, ease: "linear" },
  },
  hidden: {
    pathLength: 0,
    opacity: 1,
    transition: { duration: 0.2, ease: "linear" },
  },
};

const ReceiptTextIcon = forwardRef<ReceiptTextIconHandle, ReceiptTextIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
    const controls = useAnimation();
    const isControlledRef = useRef(false);

    const replayLines = useCallback(async () => {
      await controls.start("hidden");
      await controls.start("visible");
    }, [controls]);

    useImperativeHandle(ref, () => {
      isControlledRef.current = ref != null;
      return {
        startAnimation: () => replayLines(),
        stopAnimation: () => controls.start("visible"),
      };
    }, [controls, ref, replayLines]);

    const handleMouseEnter = useCallback(
      async (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseEnter?.(e);
        } else {
          await replayLines();
        }
      },
      [onMouseEnter, replayLines]
    );

    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseLeave?.(e);
        } else {
          controls.start("visible");
        }
      },
      [controls, onMouseLeave]
    );

    return (
      <div
        className={cn(className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        <motion.svg
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
          <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
          <motion.g
            animate={controls}
            initial="visible"
            variants={LINES_CONTAINER_VARIANTS}
          >
            <motion.path d="M8 8H14" variants={LINE_VARIANTS} />
            <motion.path d="M8 12H16" variants={LINE_VARIANTS} />
            <motion.path d="M8 16H13" variants={LINE_VARIANTS} />
          </motion.g>
        </motion.svg>
      </div>
    );
  }
);

ReceiptTextIcon.displayName = "ReceiptTextIcon";

export { ReceiptTextIcon };
