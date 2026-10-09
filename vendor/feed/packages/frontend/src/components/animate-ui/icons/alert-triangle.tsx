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

type AlertTriangleProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    triangle: {
      initial: { pathLength: 1, opacity: 1, pathOffset: 0 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        pathOffset: [1, 0],
        transition: { duration: 0.5, ease: 'linear', opacity: { duration: 0.1 } },
      },
    },
    line: {
      initial: { opacity: 1 },
      animate: {
        opacity: [0, 1],
        transition: { delay: 0.35, duration: 0.2 },
      },
    },
    dot: {
      initial: { opacity: 1 },
      animate: {
        opacity: [0, 1],
        transition: { delay: 0.5, duration: 0.15 },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, AlertTriangleProps>(function IconComponent({ size, ...props }, ref) {
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
        d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"
        variants={variants.triangle}
        initial="initial"
        animate={controls}
      />
      <motion.path
        d="M12 9v4"
        variants={variants.line}
        initial="initial"
        animate={controls}
      />
      <motion.path
        d="M12 17h.01"
        variants={variants.dot}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function AlertTriangle(props: AlertTriangleProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  AlertTriangle,
  AlertTriangle as AlertTriangleIcon,
  type AlertTriangleProps,
  type AlertTriangleProps as AlertTriangleIconProps,
};
