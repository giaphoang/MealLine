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

type LayoutTemplateProps = IconProps<keyof typeof animations>;

const cell = (delay: number): Variants => ({
  initial: { opacity: 1, scale: 1 },
  animate: {
    opacity: [0.3, 1],
    scale: [0.9, 1],
    transition: { duration: 0.3, delay, ease: 'easeOut' },
  },
});

const animations = {
  default: {
    header: cell(0),
    left: cell(0.12),
    right: cell(0.24),
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, LayoutTemplateProps>(function IconComponent({ size, ...props }, ref) {
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
      <motion.rect width={18} height={7} x={3} y={3} rx={1} variants={variants.header} initial="initial" animate={controls} style={{ transformOrigin: '12px 6.5px' }} />
      <motion.rect width={7} height={7} x={3} y={14} rx={1} variants={variants.left} initial="initial" animate={controls} style={{ transformOrigin: '6.5px 17.5px' }} />
      <motion.rect width={7} height={7} x={14} y={14} rx={1} variants={variants.right} initial="initial" animate={controls} style={{ transformOrigin: '17.5px 17.5px' }} />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function LayoutTemplate(props: LayoutTemplateProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  LayoutTemplate,
  LayoutTemplate as LayoutTemplateIcon,
  type LayoutTemplateProps,
  type LayoutTemplateProps as LayoutTemplateIconProps,
};
