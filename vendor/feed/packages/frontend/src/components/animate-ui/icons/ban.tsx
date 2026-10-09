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
// verbatim from lucide-react's __iconNode, including the full slash
// `m4.9 4.9 14.2 14.2`; the registry builds of this icon ship it truncated
// (see the SVG path truncation trap in docs/motion/ICON_ANIMATIONS.md).
//
// Used for "Revoke access" — an access action, deliberately distinct from the
// shield family used for role changes.
type BanProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    ring: {
      initial: { scale: 1 },
      animate: {
        scale: [1, 0.9, 1],
        transition: { duration: 0.5, ease: 'easeInOut', times: [0, 0.4, 1] },
      },
    },
    // The slash strikes through, which is the whole meaning of the glyph.
    slash: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.4, ease: 'easeOut', delay: 0.1 },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, BanProps>(function IconComponent({ size, ...props }, ref) {
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
        variants={variants.ring}
        initial="initial"
        animate={controls}
        style={{ transformOrigin: '12px 12px' }}
      >
        <circle cx="12" cy="12" r="10" />
      </motion.g>
      <motion.path
        d="m4.9 4.9 14.2 14.2"
        variants={variants.slash}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function Ban(props: BanProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Ban,
  Ban as BanIcon,
  type BanProps,
  type BanProps as BanIconProps,
};
