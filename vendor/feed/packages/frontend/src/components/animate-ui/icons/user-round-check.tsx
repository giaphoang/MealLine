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
// "Restore access" — the counterpart to ban. Both are person/access actions,
// distinct from the shield family used for role changes.
type UserRoundCheckProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    person: {
      initial: { y: 0 },
      animate: {
        y: [0, -1, 0],
        transition: { duration: 0.5, ease: 'easeInOut', times: [0, 0.4, 1] },
      },
    },
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

const IconComponent = React.forwardRef<SVGSVGElement, UserRoundCheckProps>(function IconComponent({ size, ...props }, ref) {
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
      <motion.g variants={variants.person} initial="initial" animate={controls}>
        <path d="M2 21a8 8 0 0 1 13.292-6" />
        <circle cx="10" cy="8" r="5" />
      </motion.g>
      <motion.path
        d="m16 19 2 2 4-4"
        variants={variants.check}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function UserRoundCheck(props: UserRoundCheckProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  UserRoundCheck,
  UserRoundCheck as UserRoundCheckIcon,
  type UserRoundCheckProps,
  type UserRoundCheckProps as UserRoundCheckIconProps,
};
