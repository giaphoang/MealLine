// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

'use client';

import { motion, useAnimation } from 'motion/react';
import type React from 'react';
import type { HTMLAttributes } from 'react';
import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';

import { cn } from '@/lib/utils';

export interface ChartNoAxesCombinedIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface ChartNoAxesCombinedIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const trendVariants = {
  normal: { pathLength: 1, opacity: 1 },
  animate: {
    pathLength: [0, 1],
    opacity: [0, 1],
    transition: { duration: 0.45, ease: 'easeOut' },
  },
};

const columnVariants = {
  normal: { pathLength: 1, opacity: 1 },
  animate: {
    pathLength: [0, 1],
    opacity: [0, 1],
    transition: { duration: 0.35, delay: 0.1, ease: 'easeOut' },
  },
};

const CHART_NO_AXES_COMBINED = forwardRef<
  ChartNoAxesCombinedIconHandle,
  ChartNoAxesCombinedIconProps
>(({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
  const controls = useAnimation();
  const isControlledRef = useRef(false);

  useImperativeHandle(ref, () => {
    isControlledRef.current = true;
    return {
      startAnimation: () => controls.start('animate'),
      stopAnimation: () => controls.start('normal'),
    };
  });

  const handleMouseEnter = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (isControlledRef.current) onMouseEnter?.(event);
      else void controls.start('animate');
    },
    [controls, onMouseEnter]
  );

  const handleMouseLeave = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (isControlledRef.current) onMouseLeave?.(event);
      else void controls.start('normal');
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
        <motion.g animate={controls} initial="normal" variants={columnVariants}>
          <path d="M12 16v5" />
          <path d="M16 14v7" />
          <path d="M20 10v11" />
          <path d="M4 18v3" />
          <path d="M8 14v7" />
        </motion.g>
        <motion.path
          animate={controls}
          d="m22 3-8.646 8.646a.5.5 0 0 1-.708 0L9.354 8.354a.5.5 0 0 0-.707 0L2 15"
          initial="normal"
          variants={trendVariants}
        />
      </svg>
    </div>
  );
});

CHART_NO_AXES_COMBINED.displayName = 'ChartNoAxesCombinedIcon';

export { CHART_NO_AXES_COMBINED as ChartNoAxesCombinedIcon };
