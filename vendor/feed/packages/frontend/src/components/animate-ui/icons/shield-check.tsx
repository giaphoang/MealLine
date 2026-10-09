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
// Pairs with shield-minus: granting authority draws the check IN, revoking it
// draws the bar OUT. Same shield, opposite motion.
type ShieldCheckProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    shield: {
      initial: { scale: 1 },
      animate: {
        scale: [1, 1.06, 1],
        transition: { duration: 0.5, ease: 'easeInOut', times: [0, 0.4, 1] },
      },
    },
    // Line tracing: the check draws on, confirming the grant.
    check: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.45, ease: 'easeOut', delay: 0.1 },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, ShieldCheckProps>(function IconComponent({ size, ...props }, ref) {
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
        d="m9 12 2 2 4-4"
        variants={variants.check}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function ShieldCheck(props: ShieldCheckProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  ShieldCheck,
  ShieldCheck as ShieldCheckIcon,
  type ShieldCheckProps,
  type ShieldCheckProps as ShieldCheckIconProps,
};
