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

type InfoProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    circle: {
      initial: { pathLength: 1, opacity: 1, pathOffset: 0 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        pathOffset: [1, 0],
        transition: { duration: 0.48, ease: 'easeInOut', opacity: { duration: 0.1 } },
      },
    },
    line: {
      initial: { opacity: 1, pathLength: 1 },
      animate: {
        opacity: [0, 1],
        pathLength: [0, 1],
        transition: { delay: 0.25, duration: 0.24, ease: 'easeOut' },
      },
    },
    dot: {
      initial: { opacity: 1, scale: 1 },
      animate: {
        opacity: [0, 1],
        scale: [0.7, 1.25, 1],
        transition: { delay: 0.42, duration: 0.22, ease: 'easeOut' },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, InfoProps>(function IconComponent({ size, ...props }, ref) {
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
      <motion.circle
        cx="12"
        cy="12"
        r="10"
        variants={variants.circle}
        initial="initial"
        animate={controls}
      />
      <motion.path
        d="M12 16v-4"
        variants={variants.line}
        initial="initial"
        animate={controls}
      />
      <motion.path
        d="M12 8h.01"
        variants={variants.dot}
        initial="initial"
        animate={controls}
        style={{ transformOrigin: '12px 8px' }}
      />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function Info(props: InfoProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Info,
  Info as InfoIcon,
  type InfoProps,
  type InfoProps as InfoIconProps,
};
