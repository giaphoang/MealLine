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

type XProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    path1: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.4, ease: 'linear', opacity: { duration: 0.1 } },
      },
    },
    path2: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { delay: 0.2, duration: 0.4, ease: 'linear', opacity: { duration: 0.1 } },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, XProps>(function IconComponent({ size, ...props }, ref) {
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
        d="M18 6 6 18"
        variants={variants.path1}
        initial="initial"
        animate={controls}
      />
      <motion.path
        d="m6 6 12 12"
        variants={variants.path2}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function X(props: XProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  X,
  X as XIcon,
  type XProps,
  type XProps as XIconProps,
};
