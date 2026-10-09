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
// Used on the Invite button. Native rather than imperative-ref so it animates
// on hover of the whole button, not only the icon's own bounding box.
type UserRoundPlusProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    person: {
      initial: { y: 0 },
      animate: {
        y: [0, -1, 0],
        transition: { duration: 0.5, ease: 'easeInOut', times: [0, 0.4, 1] },
      },
    },
    plus: {
      initial: { scale: 1, rotate: 0 },
      animate: {
        scale: [0.4, 1.15, 1],
        rotate: [-90, 0, 0],
        transition: { duration: 0.45, ease: 'easeOut', times: [0, 0.7, 1] },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, UserRoundPlusProps>(function IconComponent({ size, ...props }, ref) {
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
      <motion.g
        variants={variants.plus}
        initial="initial"
        animate={controls}
        style={{ transformOrigin: '19px 19px' }}
      >
        <path d="M19 16v6" />
        <path d="M22 19h-6" />
      </motion.g>
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function UserRoundPlus(props: UserRoundPlusProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  UserRoundPlus,
  UserRoundPlus as UserRoundPlusIcon,
  type UserRoundPlusProps,
  type UserRoundPlusProps as UserRoundPlusIconProps,
};
