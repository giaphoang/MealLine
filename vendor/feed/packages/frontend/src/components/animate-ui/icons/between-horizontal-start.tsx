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

type BetweenHorizontalStartProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    top: { initial: { x: 0 }, animate: { x: [0, -2, 0], transition: { duration: 0.45, ease: 'easeInOut' } } },
    arrow: { initial: { x: 0, pathLength: 1 }, animate: { x: [0, 2, 0], pathLength: [0, 1], transition: { duration: 0.45, ease: 'easeInOut' } } },
    bottom: { initial: { x: 0 }, animate: { x: [0, -2, 0], transition: { duration: 0.45, delay: 0.08, ease: 'easeInOut' } } },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, BetweenHorizontalStartProps>(function IconComponent({ size, ...props }, ref) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(animations);
  return (
    <motion.svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <motion.rect width="13" height="7" x="8" y="3" rx="1" variants={variants.top} initial="initial" animate={controls} />
      <motion.path d="m2 9 3 3-3 3" variants={variants.arrow} initial="initial" animate={controls} />
      <motion.rect width="13" height="7" x="8" y="14" rx="1" variants={variants.bottom} initial="initial" animate={controls} />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function BetweenHorizontalStart(props: BetweenHorizontalStartProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export { animations, BetweenHorizontalStart, BetweenHorizontalStart as BetweenHorizontalStartIcon, type BetweenHorizontalStartProps, type BetweenHorizontalStartProps as BetweenHorizontalStartIconProps };
