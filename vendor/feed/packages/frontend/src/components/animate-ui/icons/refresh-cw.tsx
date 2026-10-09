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

type RefreshCwProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    group: {
      initial: { rotate: 0, transition: { type: 'spring', stiffness: 150, damping: 25 } },
      animate: { rotate: 50, transition: { type: 'spring', stiffness: 150, damping: 25 } },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, RefreshCwProps>(function IconComponent({ size, ...props }, ref) {
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
        variants={variants.group}
        initial="initial"
        animate={controls}
        style={{ transformOrigin: 'center' }}
      >
        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
        <path d="M8 16H3v5" />
      </motion.g>
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function RefreshCw(props: RefreshCwProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  RefreshCw,
  RefreshCw as RefreshCwIcon,
  type RefreshCwProps,
  type RefreshCwProps as RefreshCwIconProps,
};
