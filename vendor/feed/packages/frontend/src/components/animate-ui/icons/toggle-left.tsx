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

type ToggleLeftProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    circle: {
      initial: { x: 0 },
      animate: {
        x: [0, 7, 6],
        transition: { duration: 0.5, ease: 'easeInOut' },
      },
    },
  } satisfies Record<string, Variants>,
  'default-loop': {
    circle: {
      initial: { x: 0 },
      animate: {
        x: [0, 7, 6, -1, 0],
        transition: { duration: 1, ease: 'easeInOut' },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, ToggleLeftProps>(function IconComponent({ size, ...props }, ref) {
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
      <rect width={20} height={14} x={2} y={5} rx={7} />
      <motion.circle
        cx={9}
        cy={12}
        r={3}
        variants={variants.circle}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function ToggleLeft(props: ToggleLeftProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  ToggleLeft,
  ToggleLeft as ToggleLeftIcon,
  type ToggleLeftProps,
  type ToggleLeftProps as ToggleLeftIconProps,
};
