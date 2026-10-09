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

// Hand-rolled animated variant of Lucide's `bell` (no upstream animate-ui
// version). Native icon so it animates via a parent <AnimateIcon> context —
// the alert button's "no new alerts" state wraps it in <AnimateIcon
// animateOnHover animateOnTap> (no `animate`, so it does NOT ring on page
// load). The bell rocks from the top. Geometry is Lucide v0.522.0 `bell`
// verbatim. See docs/motion/ICON_ANIMATIONS.md.

type BellProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    bell: {
      initial: { rotate: 0 },
      animate: {
        rotate: [0, -10, 8, -6, 4, -2, 0],
        transition: { duration: 0.6, ease: 'easeInOut' },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, BellProps>(function IconComponent({ size, ...props }, ref) {
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
      {/* clapper stays put */}
      <path d="M10.268 21a2 2 0 0 0 3.464 0" />
      {/* bell body rocks from the top */}
      <motion.path
        d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"
        variants={variants.bell}
        initial="initial"
        animate={controls}
        style={{ transformBox: 'fill-box', transformOrigin: '50% 0%' }}
      />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function Bell(props: BellProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Bell,
  Bell as BellIcon,
  type BellProps,
  type BellProps as BellIconProps,
};
