// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

'use client';

import { motion, useAnimation } from 'motion/react';
import type { HTMLAttributes, MouseEvent } from 'react';
import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';

import { animations } from '@/components/animate-ui/icons/shield-user';
import { cn } from '@/lib/utils';

export interface ShieldUserIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface ShieldUserIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const ShieldUserIcon = forwardRef<ShieldUserIconHandle, ShieldUserIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
    const controls = useAnimation();
    const isControlledRef = useRef(false);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;
      return {
        startAnimation: () => controls.start('animate'),
        stopAnimation: () => controls.start('initial'),
      };
    });

    const handleMouseEnter = useCallback((event: MouseEvent<HTMLDivElement>) => {
      if (isControlledRef.current) onMouseEnter?.(event);
      else void controls.start('animate');
    }, [controls, onMouseEnter]);
    const handleMouseLeave = useCallback((event: MouseEvent<HTMLDivElement>) => {
      if (isControlledRef.current) onMouseLeave?.(event);
      else void controls.start('initial');
    }, [controls, onMouseLeave]);

    return (
      <div className={cn(className)} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} {...props}>
        <svg fill="none" height={size} width={size} stroke="currentColor" strokeLinecap="round"
          strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <motion.path
            d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"
            variants={animations.default.shield} initial="initial" animate={controls} />
          <motion.path d="M6.376 18.91a6 6 0 0 1 11.249.003"
            variants={animations.default.shoulders} initial="initial" animate={controls} />
          <motion.circle cx="12" cy="11" r="4"
            variants={animations.default.head} initial="initial" animate={controls}
            style={{ transformOrigin: '12px 11px' }} />
        </svg>
      </div>
    );
  },
);
ShieldUserIcon.displayName = 'ShieldUserIcon';

export { ShieldUserIcon };
