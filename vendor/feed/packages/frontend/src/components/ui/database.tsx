// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

'use client';

// Imperative-ref Database icon for page-title use. Geometry is copied from
// the official Lucide `database` source and verified against its 0 0 24 24
// viewBox; see docs/motion/ICON_ANIMATIONS.md.

import { motion, useAnimation, type Variants } from 'motion/react';
import type React from 'react';
import type { HTMLAttributes } from 'react';
import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';

import { cn } from '@/lib/utils';

export interface DatabaseIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface DatabaseIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const layerVariants = (delay: number): Variants => ({
  normal: { pathLength: 1, opacity: 1 },
  animate: {
    pathLength: [0, 1],
    opacity: [0, 1],
    transition: { duration: 0.4, delay, ease: 'easeOut' },
  },
});

const DatabaseIcon = forwardRef<DatabaseIconHandle, DatabaseIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
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
          <motion.ellipse
            animate={controls}
            cx="12"
            cy="5"
            initial="normal"
            rx="9"
            ry="3"
            variants={layerVariants(0)}
          />
          <motion.path
            animate={controls}
            d="M3 12A9 3 0 0 0 21 12"
            initial="normal"
            variants={layerVariants(0.1)}
          />
          <motion.path
            animate={controls}
            d="M3 5V19A9 3 0 0 0 21 19V5"
            initial="normal"
            variants={layerVariants(0.2)}
          />
        </svg>
      </div>
    );
  }
);

DatabaseIcon.displayName = 'DatabaseIcon';

export { DatabaseIcon };
