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

// Hand-rolled animated variant of Lucide's `search-check` (no upstream
// animate-ui version). Native icon so it animates on a parent <AnimateIcon>
// context (e.g. the toolbar button). The checkmark draws on while the
// magnifying glass stays put. Geometry is Lucide v0.522.0 `search-check`
// verbatim. See docs/motion/ICON_ANIMATIONS.md.

type SearchCheckProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    check: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.5, ease: 'easeOut', opacity: { duration: 0.1 } },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, SearchCheckProps>(function IconComponent({ size, ...props }, ref) {
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
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
      <motion.path
        d="m8 11 2 2 4-4"
        variants={variants.check}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function SearchCheck(props: SearchCheckProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  SearchCheck,
  SearchCheck as SearchCheckIcon,
  type SearchCheckProps,
  type SearchCheckProps as SearchCheckIconProps,
};
