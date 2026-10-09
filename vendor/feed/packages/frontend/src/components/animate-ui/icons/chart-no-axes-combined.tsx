// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

'use client';

import * as React from 'react';
import { motion, type Variants } from 'motion/react';

import {
  getVariants,
  IconWrapper,
  useAnimateIconContext,
  type IconProps,
} from '@/components/animate-ui/icons/icon';

type ChartNoAxesCombinedProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    trend: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.45, ease: 'easeOut' },
      },
    },
    columns: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.35, delay: 0.1, ease: 'easeOut' },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, ChartNoAxesCombinedProps>(function IconComponent({ size, ...props }, ref) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(animations);

  return (
    <motion.svg ref={ref}
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
      <motion.g
        variants={variants.columns}
        initial="initial"
        animate={controls}
      >
        <path d="M12 16v5" />
        <path d="M16 14v7" />
        <path d="M20 10v11" />
        <path d="M4 18v3" />
        <path d="M8 14v7" />
      </motion.g>
      <motion.path
        d="m22 3-8.646 8.646a.5.5 0 0 1-.708 0L9.354 8.354a.5.5 0 0 0-.707 0L2 15"
        variants={variants.trend}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function ChartNoAxesCombined(props: ChartNoAxesCombinedProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  ChartNoAxesCombined,
  ChartNoAxesCombined as ChartNoAxesCombinedIcon,
  type ChartNoAxesCombinedProps,
  type ChartNoAxesCombinedProps as ChartNoAxesCombinedIconProps,
};
