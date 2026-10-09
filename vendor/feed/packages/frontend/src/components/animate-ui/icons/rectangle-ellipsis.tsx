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

type RectangleEllipsisProps = IconProps<keyof typeof animations>;

const blink = (delay: number): Variants => ({
  initial: { opacity: 1 },
  animate: {
    opacity: [1, 0.2, 1],
    transition: { duration: 0.5, delay, times: [0, 0.5, 1] },
  },
});

const animations = {
  default: {
    left: blink(0),
    middle: blink(0.12),
    right: blink(0.24),
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, RectangleEllipsisProps>(function IconComponent({ size, ...props }, ref) {
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
      {/* Static rectangle frame */}
      <rect width={20} height={12} x={2} y={6} rx={2} />
      {/* Three dots blink/fade in sequence */}
      <motion.path d="M7 12h.01" variants={variants.left} initial="initial" animate={controls} />
      <motion.path d="M12 12h.01" variants={variants.middle} initial="initial" animate={controls} />
      <motion.path d="M17 12h.01" variants={variants.right} initial="initial" animate={controls} />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function RectangleEllipsis(props: RectangleEllipsisProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  RectangleEllipsis,
  RectangleEllipsis as RectangleEllipsisIcon,
  type RectangleEllipsisProps,
  type RectangleEllipsisProps as RectangleEllipsisIconProps,
};
