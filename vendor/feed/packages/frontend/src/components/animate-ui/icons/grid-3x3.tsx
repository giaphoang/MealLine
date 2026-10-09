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

type Grid3x3Props = IconProps<keyof typeof animations>;

const draw = (delay: number): Variants => ({
  initial: { pathLength: 1, opacity: 1, pathOffset: 0 },
  animate: {
    pathLength: [0, 1],
    opacity: [0, 1],
    pathOffset: [1, 0],
    transition: {
      pathLength: { type: 'spring', duration: 0.4, bounce: 0, delay },
      opacity: { duration: 0.01, delay },
    },
  },
});

const animations = {
  default: {
    h1: draw(0),
    h2: draw(0.1),
    v1: draw(0.2),
    v2: draw(0.3),
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, Grid3x3Props>(function IconComponent({ size, ...props }, ref) {
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
      {/* Static frame */}
      <rect width={18} height={18} x={3} y={3} rx={2} />
      {/* Animated grid lines */}
      <motion.path d="M3 9h18" variants={variants.h1} initial="initial" animate={controls} />
      <motion.path d="M3 15h18" variants={variants.h2} initial="initial" animate={controls} />
      <motion.path d="M9 3v18" variants={variants.v1} initial="initial" animate={controls} />
      <motion.path d="M15 3v18" variants={variants.v2} initial="initial" animate={controls} />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function Grid3x3(props: Grid3x3Props) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Grid3x3,
  Grid3x3 as Grid3x3Icon,
  type Grid3x3Props,
  type Grid3x3Props as Grid3x3IconProps,
};
