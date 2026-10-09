// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

'use client';

import { motion, useAnimation } from 'motion/react';
import type { HTMLAttributes, MouseEvent } from 'react';
import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';

import { animations } from '@/components/animate-ui/icons/users-round';
import { cn } from '@/lib/utils';

export interface UsersRoundIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface UsersRoundIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const UsersRoundIcon = forwardRef<UsersRoundIconHandle, UsersRoundIconProps>(
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
          <motion.path d="M18 21a8 8 0 0 0-16 0"
            variants={animations.default.group} initial="initial" animate={controls} />
          <motion.circle cx="10" cy="8" r="5"
            variants={animations.default.person} initial="initial" animate={controls}
            style={{ transformOrigin: '10px 8px' }} />
          <motion.path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"
            variants={animations.default.companion} initial="initial" animate={controls} />
        </svg>
      </div>
    );
  },
);
UsersRoundIcon.displayName = 'UsersRoundIcon';

export { UsersRoundIcon };
