// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

'use client';

// Native animate-ui Database icon for parent-triggered sidebar motion.
// Geometry is copied from official Lucide `database` and verified against its
// 0 0 24 24 viewBox; see docs/motion/ICON_ANIMATIONS.md.

import * as React from 'react';
import { motion, type Variants } from 'motion/react';

import {
  getVariants,
  IconWrapper,
  useAnimateIconContext,
  type IconProps,
} from '@/components/animate-ui/icons/icon';

type DatabaseProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    top: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.4, delay: 0, ease: 'easeOut' },
      },
    },
    middle: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.4, delay: 0.1, ease: 'easeOut' },
      },
    },
    body: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.4, delay: 0.2, ease: 'easeOut' },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, DatabaseProps>(function IconComponent({ size, ...props }, ref) {
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
      <motion.ellipse
        cx="12"
        cy="5"
        rx="9"
        ry="3"
        variants={variants.top}
        initial="initial"
        animate={controls}
      />
      <motion.path
        d="M3 12A9 3 0 0 0 21 12"
        variants={variants.middle}
        initial="initial"
        animate={controls}
      />
      <motion.path
        d="M3 5V19A9 3 0 0 0 21 19V5"
        variants={variants.body}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function Database(props: DatabaseProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Database,
  Database as DatabaseIcon,
  type DatabaseProps,
  type DatabaseProps as DatabaseIconProps,
};
