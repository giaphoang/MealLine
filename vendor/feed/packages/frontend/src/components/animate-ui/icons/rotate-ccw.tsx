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

type RotateCcwProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    group: {
      initial: { rotate: 0, transition: { type: 'spring', stiffness: 150, damping: 25 } },
      animate: { rotate: -45, transition: { type: 'spring', stiffness: 150, damping: 25 } },
    },
  } satisfies Record<string, Variants>,
  rotate: {
    group: {
      initial: { rotate: 0, transition: { type: 'spring', stiffness: 150, damping: 25 } },
      animate: { rotate: -360, transition: { type: 'spring', stiffness: 150, damping: 25 } },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, RotateCcwProps>(function IconComponent({ size, ...props }, ref) {
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
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
      </motion.g>
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function RotateCcw(props: RotateCcwProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  RotateCcw,
  RotateCcw as RotateCcwIcon,
  type RotateCcwProps,
  type RotateCcwProps as RotateCcwIconProps,
};
