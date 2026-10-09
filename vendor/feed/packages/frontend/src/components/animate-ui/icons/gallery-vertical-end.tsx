// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

'use client';

import * as React from 'react';
import { motion, type Variants } from 'motion/react';

import { getVariants, IconWrapper, useAnimateIconContext, type IconProps } from '@/components/animate-ui/icons/icon';

type GalleryVerticalEndProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    line1: { initial: { pathLength: 1 }, animate: { pathLength: [0, 1], transition: { duration: 0.25 } } },
    line2: { initial: { pathLength: 1 }, animate: { pathLength: [0, 1], transition: { duration: 0.3, delay: 0.08 } } },
    frame: { initial: { y: 0 }, animate: { y: [0, -1, 0], transition: { duration: 0.45, delay: 0.12, ease: 'easeInOut' } } },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, GalleryVerticalEndProps>(function IconComponent({ size, ...props }, ref) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(animations);
  return (
    <motion.svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <motion.path d="M7 2h10" variants={variants.line1} initial="initial" animate={controls} />
      <motion.path d="M5 6h14" variants={variants.line2} initial="initial" animate={controls} />
      <motion.rect width="18" height="12" x="3" y="10" rx="2" variants={variants.frame} initial="initial" animate={controls} />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function GalleryVerticalEnd(props: GalleryVerticalEndProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export { animations, GalleryVerticalEnd, GalleryVerticalEnd as GalleryVerticalEndIcon, type GalleryVerticalEndProps, type GalleryVerticalEndProps as GalleryVerticalEndIconProps };
