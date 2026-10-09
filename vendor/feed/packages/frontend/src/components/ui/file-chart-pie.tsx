// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

'use client';

import { motion, useAnimation } from 'motion/react';
import type { HTMLAttributes, MouseEvent } from 'react';
import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';

import { animations } from '@/components/animate-ui/icons/file-chart-pie';
import { cn } from '@/lib/utils';

export interface FileChartPieIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface FileChartPieIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const FileChartPieIcon = forwardRef<FileChartPieIconHandle, FileChartPieIconProps>(
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
          <motion.path d="M14 2v4a2 2 0 0 0 2 2h4"
            variants={animations.default.fold} initial="initial" animate={controls} />
          <motion.path d="M16 22h2a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v3.5"
            variants={animations.default.file} initial="initial" animate={controls} />
          <motion.path d="M4.017 11.512a6 6 0 1 0 8.466 8.475"
            variants={animations.default.chart} initial="initial" animate={controls} />
          <motion.path
            d="M9 16a1 1 0 0 1-1-1v-4c0-.552.45-1.008.995-.917a6 6 0 0 1 4.922 4.922c.091.544-.365.995-.917.995z"
            variants={animations.default.slice} initial="initial" animate={controls}
            style={{ transformOrigin: '11px 13px' }} />
        </svg>
      </div>
    );
  },
);
FileChartPieIcon.displayName = 'FileChartPieIcon';

export { FileChartPieIcon };
