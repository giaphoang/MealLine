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

type LayoutDashboardProps = IconProps<keyof typeof animations>;

const tile = (x: number, y: number): Variants => ({
  initial: { x: 0, y: 0, scale: 1 },
  animate: {
    x: [0, x, 0],
    y: [0, y, 0],
    scale: [1, 0.92, 1],
    transition: { duration: 0.55, ease: 'easeInOut' },
  },
});

const animations = {
  default: {
    rect1: tile(1, 1),
    rect2: tile(-1, 1),
    rect3: tile(-1, -1),
    rect4: tile(1, -1),
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, LayoutDashboardProps>(function IconComponent({ size, ...props }, ref) {
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
      <motion.rect width="7" height="9" x="3" y="3" rx="1" variants={variants.rect1} initial="initial" animate={controls} />
      <motion.rect width="7" height="5" x="14" y="3" rx="1" variants={variants.rect2} initial="initial" animate={controls} />
      <motion.rect width="7" height="9" x="14" y="12" rx="1" variants={variants.rect3} initial="initial" animate={controls} />
      <motion.rect width="7" height="5" x="3" y="16" rx="1" variants={variants.rect4} initial="initial" animate={controls} />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function LayoutDashboard(props: LayoutDashboardProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  LayoutDashboard,
  LayoutDashboard as LayoutDashboardIcon,
  type LayoutDashboardProps,
  type LayoutDashboardProps as LayoutDashboardIconProps,
};
