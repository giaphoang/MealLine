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
  IconWrapper,
  useAnimateIconContext,
  type IconProps,
} from '@/components/animate-ui/icons/icon';

type UndoProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    arrow: {
      initial: { translateX: 0, translateY: 0, rotate: 0 },
      animate: {
        translateX: [0, 2, 0],
        translateY: [0, -1.5, 0],
        rotate: [0, 12, 0],
        transition: { duration: 0.5, ease: 'easeInOut' },
      },
    },
    arc: {
      initial: { pathLength: 1 },
      animate: {
        pathLength: [1, 0.8, 1],
        transition: { duration: 0.5, ease: 'easeInOut' },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, UndoProps>(function IconComponent({ size, ...props }, ref) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(animations);

  return (
    <motion.svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <motion.path d="M3 7v6h6" variants={variants.arrow} initial="initial" animate={controls} />
      <motion.path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" variants={variants.arc} initial="initial" animate={controls} />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function Undo(props: UndoProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export { animations, Undo, Undo as UndoIcon, type UndoProps, type UndoProps as UndoIconProps };
