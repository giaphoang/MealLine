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

export interface ShapesIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface ShapesIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const SHAPE_VARIANTS: Variants = {
  normal: { opacity: 1, scale: 1, rotate: 0 },
  animate: (i: number) => ({
    opacity: [0, 1],
    scale: [0.6, 1.08, 1],
    rotate: [-12, 0],
    transition: {
      delay: i * 0.12,
      duration: 0.45,
      ease: "easeOut",
    },
  }),
};

const ShapesIcon = forwardRef<ShapesIconHandle, ShapesIconProps>(
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
          {/* triangle */}
          <motion.path
            animate={controls}
            custom={0}
            d="M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z"
            initial="normal"
            variants={SHAPE_VARIANTS}
            style={{ transformOrigin: "12px 6.5px" }}
          />
          {/* circle */}
          <motion.circle
            animate={controls}
            custom={1}
            cx="6.5"
            cy="17.5"
            initial="normal"
            r="4.5"
            variants={SHAPE_VARIANTS}
            style={{ transformOrigin: "6.5px 17.5px" }}
          />
          {/* square */}
          <motion.rect
            animate={controls}
            custom={2}
            height="8"
            initial="normal"
            rx="1"
            variants={SHAPE_VARIANTS}
            width="8"
            x="13"
            y="13"
            style={{ transformOrigin: "17px 17px" }}
          />
        </svg>
      </div>
    );
  },
);

ShapesIcon.displayName = "ShapesIcon";

export { ShapesIcon };
