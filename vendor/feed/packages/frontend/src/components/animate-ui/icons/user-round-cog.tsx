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

// Hand-rolled: neither registry ships an animate-ui `user-round-cog`, and the
// lucide-animated build is an imperative-ref icon, which cannot read a parent
// AnimateIcon context (see docs/motion/ICON_ANIMATIONS.md). Geometry copied
// verbatim from lucide-react's __iconNode so the resting state is identical to
// the static icon.
type UserRoundCogProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    // The cog turns — the settings gesture, borrowed from SettingsIcon.
    cog: {
      initial: { rotate: 0 },
      animate: {
        rotate: 90,
        transition: { duration: 0.5, ease: 'easeInOut' },
      },
    },
    // The person gives a small nod so the whole glyph reads as one unit.
    person: {
      initial: { y: 0 },
      animate: {
        y: [0, -1, 0],
        transition: { duration: 0.5, ease: 'easeInOut', times: [0, 0.4, 1] },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, UserRoundCogProps>(function IconComponent({ size, ...props }, ref) {
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
        <path d="M2 21a8 8 0 0 1 10.434-7.62" />
        <circle cx="10" cy="8" r="5" />
      </motion.g>
      <motion.g
        variants={variants.cog}
        initial="initial"
        animate={controls}
        style={{ transformOrigin: '18px 18px' }}
      >
        <path d="m14.305 19.53.923-.382" />
        <path d="m15.228 16.852-.923-.383" />
        <path d="m16.852 15.228-.383-.923" />
        <path d="m16.852 20.772-.383.924" />
        <path d="m19.148 15.228.383-.923" />
        <path d="m19.53 21.696-.382-.924" />
        <path d="m20.772 16.852.924-.383" />
        <path d="m20.772 19.148.924.383" />
        <circle cx="18" cy="18" r="3" />
      </motion.g>
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function UserRoundCog(props: UserRoundCogProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  UserRoundCog,
  UserRoundCog as UserRoundCogIcon,
  type UserRoundCogProps,
  type UserRoundCogProps as UserRoundCogIconProps,
};
