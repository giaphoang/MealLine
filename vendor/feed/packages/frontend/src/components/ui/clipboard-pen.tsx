// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

'use client';

import { motion, useAnimation } from 'motion/react';
import type { HTMLAttributes, MouseEvent } from 'react';
import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';

import { animations } from '@/components/animate-ui/icons/clipboard-pen';
import { cn } from '@/lib/utils';

export interface ClipboardPenIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface ClipboardPenIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const ClipboardPenIcon = forwardRef<ClipboardPenIconHandle, ClipboardPenIconProps>(
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
          <motion.rect width="8" height="4" x="8" y="2" rx="1"
            variants={animations.default.clip} initial="initial" animate={controls} />
          <motion.path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5.5"
            variants={animations.default.boardRight} initial="initial" animate={controls} />
          <motion.path d="M4 13.5V6a2 2 0 0 1 2-2h2"
            variants={animations.default.boardLeft} initial="initial" animate={controls} />
          <motion.path
            d="M13.378 15.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"
            variants={animations.default.pen} initial="initial" animate={controls}
            style={{ transformOrigin: '9px 17px' }} />
        </svg>
      </div>
    );
  },
);
ClipboardPenIcon.displayName = 'ClipboardPenIcon';

export { ClipboardPenIcon };
