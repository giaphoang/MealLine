// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

'use client';

import * as React from 'react';
import { motion, type Variants } from 'motion/react';

import {
  getVariants,
  IconWrapper,
  useAnimateIconContext,
  type IconProps,
} from '@/components/animate-ui/icons/icon';

type ShieldUserProps = IconProps<keyof typeof animations>;

const trace = (delay: number, duration: number): Variants => ({
  initial: { pathLength: 1, pathOffset: 0, opacity: 1 },
  animate: {
    pathLength: [0, 1],
    pathOffset: [1, 0],
    opacity: [0, 1],
    transition: { delay, duration, ease: 'easeInOut' },
  },
});

const animations = {
  default: {
    shield: trace(0, 0.48),
    shoulders: trace(0.24, 0.34),
    head: {
      initial: { opacity: 1, scale: 1 },
      animate: {
        opacity: [0, 1],
        scale: [0.5, 1.1, 1],
        transition: { delay: 0.18, duration: 0.36, ease: 'easeOut' },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, ShieldUserProps>(
  function IconComponent({ size, ...props }, ref) {
    const { controls } = useAnimateIconContext();
    const variants = getVariants(animations);

    return (
      <motion.svg
        ref={ref}
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
          d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"
          variants={variants.shield}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="M6.376 18.91a6 6 0 0 1 11.249.003"
          variants={variants.shoulders}
          initial="initial"
          animate={controls}
        />
        <motion.circle
          cx="12"
          cy="11"
          r="4"
          variants={variants.head}
          initial="initial"
          animate={controls}
          style={{ transformOrigin: '12px 11px' }}
        />
      </motion.svg>
    );
  },
);
IconComponent.displayName = 'IconComponent';

function ShieldUser(props: ShieldUserProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  ShieldUser,
  ShieldUser as ShieldUserIcon,
  type ShieldUserProps,
  type ShieldUserProps as ShieldUserIconProps,
};
