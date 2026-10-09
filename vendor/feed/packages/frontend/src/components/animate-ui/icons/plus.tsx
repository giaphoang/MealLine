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

type PlusProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    // Plus rotates as a unit — 90° spring overshoot then settle
    group: {
      initial: { rotate: 0 },
      animate: {
        rotate: 90,
        transition: { type: 'spring', stiffness: 200, damping: 18 },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, PlusProps>(function IconComponent({ size, ...props }, ref) {
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
        <path d="M5 12h14" />
        <path d="M12 5v14" />
      </motion.g>
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function Plus(props: PlusProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Plus,
  Plus as PlusIcon,
  type PlusProps,
  type PlusProps as PlusIconProps,
};
