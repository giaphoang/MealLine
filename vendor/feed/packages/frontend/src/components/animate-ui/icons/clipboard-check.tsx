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

type ClipboardCheckProps = IconProps<keyof typeof animations>;

const draw: Variants = {
  initial: { pathLength: 1, opacity: 1 },
  animate: {
    pathLength: [0, 1],
    opacity: [0, 1],
    transition: { duration: 0.45, ease: 'easeInOut' },
  },
};

const animations = {
  default: {
    rect: {},
    board: {},
    check: draw,
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, ClipboardCheckProps>(function IconComponent({ size, ...props }, ref) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(animations);

  return (
    <motion.svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <motion.rect width="8" height="4" x="8" y="2" rx="1" ry="1" variants={variants.rect} initial="initial" animate={controls} />
      <motion.path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" variants={variants.board} initial="initial" animate={controls} />
      <motion.path d="m9 14 2 2 4-4" variants={variants.check} initial="initial" animate={controls} />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function ClipboardCheck(props: ClipboardCheckProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export { animations, ClipboardCheck, ClipboardCheck as ClipboardCheckIcon, type ClipboardCheckProps, type ClipboardCheckProps as ClipboardCheckIconProps };
