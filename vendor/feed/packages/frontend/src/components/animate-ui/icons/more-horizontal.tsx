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

type MoreHorizontalProps = IconProps<keyof typeof animations>;

const pulse = (delay: number): Variants => ({
  initial: { scale: 1, opacity: 1 },
  animate: {
    scale: [1, 1.5, 1],
    opacity: [1, 0.5, 1],
    transition: { duration: 0.4, delay, times: [0, 0.5, 1] },
  },
});

const animations = {
  default: {
    left: pulse(0),
    middle: pulse(0.1),
    right: pulse(0.2),
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, MoreHorizontalProps>(function IconComponent({ size, ...props }, ref) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(animations);

  return (
    <motion.svg ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <motion.circle cx={5} cy={12} r={1} variants={variants.left} initial="initial" animate={controls} style={{ transformOrigin: '5px 12px' }} />
      <motion.circle cx={12} cy={12} r={1} variants={variants.middle} initial="initial" animate={controls} style={{ transformOrigin: '12px 12px' }} />
      <motion.circle cx={19} cy={12} r={1} variants={variants.right} initial="initial" animate={controls} style={{ transformOrigin: '19px 12px' }} />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function MoreHorizontal(props: MoreHorizontalProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  MoreHorizontal,
  MoreHorizontal as MoreHorizontalIcon,
  type MoreHorizontalProps,
  type MoreHorizontalProps as MoreHorizontalIconProps,
};
