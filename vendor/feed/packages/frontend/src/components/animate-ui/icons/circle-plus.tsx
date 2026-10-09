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

type CirclePlusProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    // Plus group rotates 90° spring; circle stays fixed
    plus: {
      initial: { rotate: 0 },
      animate: {
        rotate: 90,
        transition: { type: 'spring', stiffness: 200, damping: 18 },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, CirclePlusProps>(function IconComponent({ size, ...props }, ref) {
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
      <circle cx={12} cy={12} r={10} />
      <motion.g
        variants={variants.plus}
        initial="initial"
        animate={controls}
        style={{ transformOrigin: 'center' }}
      >
        <path d="M8 12h8" />
        <path d="M12 8v8" />
      </motion.g>
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function CirclePlus(props: CirclePlusProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  CirclePlus,
  CirclePlus as CirclePlusIcon,
  type CirclePlusProps,
  type CirclePlusProps as CirclePlusIconProps,
};
