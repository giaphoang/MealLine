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

type ArrowLeftRightProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    // Right arrow (top): chevron loads toward center, line contracts
    rightChevron: {
      initial: { x: 0 },
      animate: { x: [0, -3, 0], transition: { duration: 0.4 } },
    },
    rightLine: {
      initial: { d: 'M20 8H7' },
      animate: { d: ['M20 8H7', 'M20 8H14', 'M20 8H7'], transition: { duration: 0.4 } },
    },
    // Left arrow (bottom): chevron loads toward center, line contracts
    leftChevron: {
      initial: { x: 0 },
      animate: { x: [0, 3, 0], transition: { duration: 0.4 } },
    },
    leftLine: {
      initial: { d: 'M4 16h13' },
      animate: { d: ['M4 16h13', 'M4 16h6', 'M4 16h13'], transition: { duration: 0.4 } },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, ArrowLeftRightProps>(function IconComponent({ size, ...props }, ref) {
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
      <motion.path
        d="m17 11 3-3-3-3"
        variants={variants.rightChevron}
        initial="initial"
        animate={controls}
      />
      <motion.path
        d="M20 8H7"
        variants={variants.rightLine}
        initial="initial"
        animate={controls}
      />
      <motion.path
        d="m7 13-3 3 3 3"
        variants={variants.leftChevron}
        initial="initial"
        animate={controls}
      />
      <motion.path
        d="M4 16h13"
        variants={variants.leftLine}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function ArrowLeftRight(props: ArrowLeftRightProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  ArrowLeftRight,
  ArrowLeftRight as ArrowLeftRightIcon,
  type ArrowLeftRightProps,
  type ArrowLeftRightProps as ArrowLeftRightIconProps,
};
