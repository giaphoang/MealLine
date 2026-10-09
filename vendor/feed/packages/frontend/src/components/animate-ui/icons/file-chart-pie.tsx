// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

'use client';

import * as React from 'react';
import { motion, type Variants } from 'motion/react';

import {
  getVariants,
  IconWrapper,
  useAnimateIconContext,
  type IconProps,
} from '@/components/animate-ui/icons/icon';

// Native animate-ui variant of Lucide v0.522.0 `file-chart-pie`.
// Geometry is copied verbatim so the resting icon matches Lucide exactly.
type FileChartPieProps = IconProps<keyof typeof animations>;

const trace = (delay: number, duration: number): Variants => ({
  initial: { pathLength: 1, pathOffset: 0, opacity: 1 },
  animate: {
    pathLength: [0, 1],
    pathOffset: [1, 0],
    opacity: [0, 1],
    transition: {
      delay,
      duration,
      ease: 'easeInOut',
      opacity: { delay, duration: 0.12 },
    },
  },
});

const animations = {
  default: {
    file: trace(0, 0.42),
    fold: trace(0.08, 0.28),
    chart: trace(0.18, 0.42),
    slice: {
      initial: { opacity: 1, scale: 1, rotate: 0 },
      animate: {
        opacity: [0, 1],
        scale: [0.45, 1.08, 1],
        rotate: [-18, 3, 0],
        transition: { delay: 0.3, duration: 0.4, ease: 'easeOut' },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, FileChartPieProps>(
  function IconComponent({ size, ...props }, ref) {
    const { controls } = useAnimateIconContext();
    const variants = getVariants(animations);

    return (
      <motion.svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
      >
        <motion.path
          d="M14 2v4a2 2 0 0 0 2 2h4"
          variants={variants.fold}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="M16 22h2a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v3.5"
          variants={variants.file}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="M4.017 11.512a6 6 0 1 0 8.466 8.475"
          variants={variants.chart}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="M9 16a1 1 0 0 1-1-1v-4c0-.552.45-1.008.995-.917a6 6 0 0 1 4.922 4.922c.091.544-.365.995-.917.995z"
          variants={variants.slice}
          initial="initial"
          animate={controls}
          style={{ transformOrigin: '11px 13px' }}
        />
      </motion.svg>
    );
  },
);
IconComponent.displayName = 'IconComponent';

function FileChartPie(props: FileChartPieProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  FileChartPie,
  FileChartPie as FileChartPieIcon,
  type FileChartPieProps,
  type FileChartPieProps as FileChartPieIconProps,
};
