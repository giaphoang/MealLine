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

type GaugeProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    path1: {
      initial: {
        rotate: 0,
        transition: { ease: 'easeInOut', duration: 0.3 },
      },
      animate: {
        transformOrigin: 'bottom left',
        rotate: 70,
        transition: { ease: 'easeInOut', duration: 0.3 },
      },
    },
    path2: {},
  } satisfies Record<string, Variants>,
  'default-loop': {
    path1: {
      initial: {
        rotate: 0,
        transition: { ease: 'easeInOut', duration: 0.6 },
      },
      animate: {
        transformOrigin: 'bottom left',
        rotate: [0, 70, 0],
        transition: { ease: 'easeInOut', duration: 0.6 },
      },
    },
    path2: {},
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, GaugeProps>(function IconComponent({ size, ...props }, ref) {
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
      <motion.path
        d="m12 14 4-4"
        variants={variants.path1}
        initial="initial"
        animate={controls}
      />
      <motion.path
        d="M3.34 19a10 10 0 1 1 17.32 0"
        variants={variants.path2}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function Gauge(props: GaugeProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Gauge,
  Gauge as GaugeIcon,
  type GaugeProps,
  type GaugeProps as GaugeIconProps,
};
