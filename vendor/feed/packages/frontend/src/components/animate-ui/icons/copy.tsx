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

type CopyProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    top: {
      initial: { translateX: 0, translateY: 0 },
      animate: {
        translateX: [0, -3, 0],
        translateY: [0, -3, 0],
        transition: { duration: 0.4, ease: 'easeInOut' },
      },
    },
    bottom: {
      initial: { translateX: 0, translateY: 0 },
      animate: {
        translateX: [0, 3, 0],
        translateY: [0, 3, 0],
        transition: { duration: 0.4, ease: 'easeInOut' },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, CopyProps>(function IconComponent({ size, ...props }, ref) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(animations);

  return (
    <motion.svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <motion.rect width="14" height="14" x="8" y="8" rx="2" ry="2" variants={variants.top} initial="initial" animate={controls} />
      <motion.path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" variants={variants.bottom} initial="initial" animate={controls} />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function Copy(props: CopyProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export { animations, Copy, Copy as CopyIcon, type CopyProps, type CopyProps as CopyIconProps };
