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

type MinusProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    line: {
      initial: { pathLength: 1, opacity: 1, pathOffset: 0 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        pathOffset: [1, 0],
        transition: {
          pathLength: { type: 'spring', duration: 0.4, bounce: 0 },
          opacity: { duration: 0.01 },
        },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, MinusProps>(function IconComponent({ size, ...props }, ref) {
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
      <motion.path d="M5 12h14" variants={variants.line} initial="initial" animate={controls} />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function Minus(props: MinusProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Minus,
  Minus as MinusIcon,
  type MinusProps,
  type MinusProps as MinusIconProps,
};
