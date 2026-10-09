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

type UsersRoundProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    group: {
      initial: { pathLength: 1, pathOffset: 0, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        pathOffset: [1, 0],
        opacity: [0, 1],
        transition: { duration: 0.42, delay: 0.16, ease: 'easeInOut' },
      },
    },
    person: {
      initial: { opacity: 1, scale: 1 },
      animate: {
        opacity: [0, 1],
        scale: [0.58, 1.08, 1],
        transition: { duration: 0.38, ease: 'easeOut' },
      },
    },
    companion: {
      initial: { pathLength: 1, opacity: 1, x: 0 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        x: [2.5, 0],
        transition: { duration: 0.46, delay: 0.24, ease: 'easeOut' },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, UsersRoundProps>(
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
          d="M18 21a8 8 0 0 0-16 0"
          variants={variants.group}
          initial="initial"
          animate={controls}
        />
        <motion.circle
          cx="10"
          cy="8"
          r="5"
          variants={variants.person}
          initial="initial"
          animate={controls}
          style={{ transformOrigin: '10px 8px' }}
        />
        <motion.path
          d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"
          variants={variants.companion}
          initial="initial"
          animate={controls}
        />
      </motion.svg>
    );
  },
);
IconComponent.displayName = 'IconComponent';

function UsersRound(props: UsersRoundProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  UsersRound,
  UsersRound as UsersRoundIcon,
  type UsersRoundProps,
  type UsersRoundProps as UsersRoundIconProps,
};
