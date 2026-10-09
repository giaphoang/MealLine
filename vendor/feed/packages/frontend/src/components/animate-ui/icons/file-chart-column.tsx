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
  useAnimateIconContext,
  IconWrapper,
  type IconProps,
} from '@/components/animate-ui/icons/icon';

// Hand-authored (not registry-installed) to avoid the documented
// `viewBox="0 24"` and truncated-path registry bugs; paths match the
// official Lucide `file-chart-column` source.

type FileChartColumnProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    // The three chart bars redraw upward with a slight stagger.
    bar1: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.3, delay: 0 },
      },
    },
    bar2: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.3, delay: 0.1 },
      },
    },
    bar3: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.3, delay: 0.2 },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, FileChartColumnProps>(function IconComponent({ size, ...props }, ref) {
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
      {/* File body and fold corner stay fixed */}
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      {/* Column-chart bars (short → tall → medium) */}
      <motion.path
        d="M8 18v-1"
        variants={variants.bar1}
        initial="initial"
        animate={controls}
      />
      <motion.path
        d="M12 18v-6"
        variants={variants.bar2}
        initial="initial"
        animate={controls}
      />
      <motion.path
        d="M16 18v-3"
        variants={variants.bar3}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function FileChartColumn(props: FileChartColumnProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  FileChartColumn,
  FileChartColumn as FileChartColumnIcon,
  type FileChartColumnProps,
  type FileChartColumnProps as FileChartColumnIconProps,
};
