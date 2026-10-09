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

type ChevronUpProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    path: { initial: { y: 0 }, animate: { y: [0, -2, 0], transition: { duration: 0.4, ease: 'easeInOut' } } },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, ChevronUpProps>(function IconComponent({ size, ...props }, ref) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(animations);
  return <motion.svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}><motion.path d="m18 15-6-6-6 6" variants={variants.path} initial="initial" animate={controls} /></motion.svg>;
});
IconComponent.displayName = 'IconComponent';

function ChevronUp(props: ChevronUpProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export { animations, ChevronUp, ChevronUp as ChevronUpIcon, type ChevronUpProps, type ChevronUpProps as ChevronUpIconProps };
