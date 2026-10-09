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

// Hand-rolled native icon — see the note in user-round-cog.tsx. Geometry is
// verbatim from lucide-react's __iconNode.
//
// The shield family means *role*: granting or removing administrator
// authority. Access changes use the ban / user-round-check pair instead, so
// the two kinds of action never share an icon.
type ShieldMinusProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    shield: {
      initial: { scale: 1 },
      animate: {
        scale: [1, 0.94, 1],
        transition: { duration: 0.5, ease: 'easeInOut', times: [0, 0.4, 1] },
      },
    },
    // Inverse of shield-check: the bar retracts, then returns — authority
    // being taken away rather than conferred.
    bar: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [1, 0, 1],
        opacity: [1, 0.35, 1],
        transition: { duration: 0.5, ease: 'easeInOut', times: [0, 0.5, 1] },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, ShieldMinusProps>(function IconComponent({ size, ...props }, ref) {
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
        variants={variants.shield}
        initial="initial"
        animate={controls}
        style={{ transformOrigin: '12px 12px' }}
      >
        <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      </motion.g>
      <motion.path
        d="M9 12h6"
        variants={variants.bar}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function ShieldMinus(props: ShieldMinusProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  ShieldMinus,
  ShieldMinus as ShieldMinusIcon,
  type ShieldMinusProps,
  type ShieldMinusProps as ShieldMinusIconProps,
};
