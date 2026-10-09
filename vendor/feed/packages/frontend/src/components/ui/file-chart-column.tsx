// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client";

// Imperative-ref FileChartColumn for page-title use (parallel to the
// native animate-ui variant in animate-ui/icons/file-chart-column.tsx).
// Hand-authored; paths match the official Lucide `file-chart-column`.

import { motion, useAnimation } from "motion/react";
import type React from "react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface FileChartColumnIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface FileChartColumnIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const barVariants = (delay: number) => ({
  normal: { pathLength: 1, opacity: 1 },
  animate: {
    pathLength: [0, 1],
    opacity: [0, 1],
    transition: { duration: 0.3, delay },
  },
});

const FILE_CHART_COLUMN = forwardRef<
  FileChartColumnIconHandle,
  FileChartColumnIconProps
>(({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
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
      if (isControlledRef.current) {
        onMouseEnter?.(e);
      } else {
        controls.start("animate");
      }
    },
    [controls, onMouseEnter]
  );

  const handleMouseLeave = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isControlledRef.current) {
        onMouseLeave?.(e);
      } else {
        controls.start("normal");
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
        {/* File body and fold corner stay fixed */}
        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
        <path d="M14 2v4a2 2 0 0 0 2 2h4" />
        {/* Bars animate on a child group, never the svg root
            (ICON_ANIMATIONS.md silent-failure trap) */}
        <motion.path
          animate={controls}
          d="M8 18v-1"
          initial="normal"
          variants={barVariants(0)}
        />
        <motion.path
          animate={controls}
          d="M12 18v-6"
          initial="normal"
          variants={barVariants(0.1)}
        />
        <motion.path
          animate={controls}
          d="M16 18v-3"
          initial="normal"
          variants={barVariants(0.2)}
        />
      </svg>
    </div>
  );
});

FILE_CHART_COLUMN.displayName = "FileChartColumnIcon";

export { FILE_CHART_COLUMN as FileChartColumnIcon };
