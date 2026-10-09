// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

'use client';

import * as React from 'react';
import { motion, type Variants } from 'motion/react';

import { getVariants, IconWrapper, useAnimateIconContext, type IconProps } from '@/components/animate-ui/icons/icon';

type SquareArrowOutUpRightProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    frame: {},
    arrow: {
      initial: { pathLength: 1, x: 0, y: 0 },
      animate: { pathLength: [0, 1], x: [0, 1, 0], y: [0, -1, 0], transition: { duration: 0.55, ease: 'easeInOut' } },
    },
    head: {
      initial: { pathLength: 1, x: 0, y: 0 },
      animate: { pathLength: [0, 1], x: [0, 1, 0], y: [0, -1, 0], transition: { duration: 0.45, delay: 0.08, ease: 'easeInOut' } },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, SquareArrowOutUpRightProps>(function IconComponent({ size, ...props }, ref) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(animations);

  return (
    <motion.svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <motion.path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6" variants={variants.frame} initial="initial" animate={controls} />
      <motion.path d="m21 3-9 9" variants={variants.arrow} initial="initial" animate={controls} />
      <motion.path d="M15 3h6v6" variants={variants.head} initial="initial" animate={controls} />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function SquareArrowOutUpRight(props: SquareArrowOutUpRightProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export { animations, SquareArrowOutUpRight, SquareArrowOutUpRight as SquareArrowOutUpRightIcon, type SquareArrowOutUpRightProps, type SquareArrowOutUpRightProps as SquareArrowOutUpRightIconProps };
