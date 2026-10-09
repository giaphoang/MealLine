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

type SaveProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    // Disk body bounces down a few units like it's being inserted into a
    // drive — a clearly visible "save" gesture at 16px size.
    body: {
      initial: { y: 0 },
      animate: {
        y: [0, 2.5, 0],
        transition: { duration: 0.55, times: [0, 0.4, 1], ease: 'easeInOut' },
      },
    },
    // Label panel slides in for sequencing, then settles.
    label: {
      initial: { y: 0 },
      animate: {
        y: [0, 2.5, 0],
        transition: { duration: 0.55, times: [0, 0.4, 1], ease: 'easeInOut', },
      },
    },
    // Top shutter slides left (suggests a read mechanism)
    shutter: {
        initial: { y: 0, x: 0 },
      animate: {
        y: [0, 2.5, 0],
        x: [0, 2.5, 0],
        transition: { duration: 0.55, times: [0, 0.4, 1], ease: 'easeInOut', },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, SaveProps>(function IconComponent({ size, ...props }, ref) {
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
        d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"
        variants={variants.body}
        initial="initial"
        animate={controls}
      />
      <motion.path
        d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"
        variants={variants.label}
        initial="initial"
        animate={controls}
      />
      <motion.path
        d="M7 3v4a1 1 0 0 0 1 1h7"
        variants={variants.shutter}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function Save(props: SaveProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Save,
  Save as SaveIcon,
  type SaveProps,
  type SaveProps as SaveIconProps,
};
