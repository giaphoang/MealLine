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

type ClipboardPenProps = IconProps<keyof typeof animations>;

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
    clip: trace(0, 0.28),
    boardRight: trace(0.06, 0.38),
    boardLeft: trace(0.12, 0.32),
    pen: {
      initial: { pathLength: 1, opacity: 1, x: 0, y: 0, rotate: 0 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        x: [2, 0],
        y: [-2, 0],
        rotate: [-8, 0],
        transition: { delay: 0.24, duration: 0.46, ease: 'easeOut' },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, ClipboardPenProps>(
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
        <motion.rect
          width="8"
          height="4"
          x="8"
          y="2"
          rx="1"
          variants={variants.clip}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5.5"
          variants={variants.boardRight}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="M4 13.5V6a2 2 0 0 1 2-2h2"
          variants={variants.boardLeft}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="M13.378 15.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"
          variants={variants.pen}
          initial="initial"
          animate={controls}
          style={{ transformOrigin: '9px 17px' }}
        />
      </motion.svg>
    );
  },
);
IconComponent.displayName = 'IconComponent';

function ClipboardPen(props: ClipboardPenProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  ClipboardPen,
  ClipboardPen as ClipboardPenIcon,
  type ClipboardPenProps,
  type ClipboardPenProps as ClipboardPenIconProps,
};
