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

type SquareDashedMousePointerProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    // Pointer triangle scales up briefly then settles — evokes a "click"
    // gesture that fits the Freeform layout-mode metaphor.
    pointer: {
      initial: { scale: 1, x: 0, y: 0 },
      animate: {
        scale: [1, 1.15, 1],
        x: [0, 0.8, 0],
        y: [0, 0.8, 0],
        transition: { duration: 0.4, times: [0, 0.45, 1], ease: 'easeOut' },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, SquareDashedMousePointerProps>(function IconComponent({ size, ...props }, ref) {
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
      {/* Dashed-square fragments (static) — exact Lucide v0.522.0 paths */}
      <path d="M5 3a2 2 0 0 0-2 2" />
      <path d="M19 3a2 2 0 0 1 2 2" />
      <path d="M5 21a2 2 0 0 1-2-2" />
      <path d="M9 3h1" />
      <path d="M9 21h2" />
      <path d="M14 3h1" />
      <path d="M3 9v1" />
      <path d="M21 9v2" />
      <path d="M3 14v1" />
      {/* Pointer triangle pulses — wrapped in motion.g so scale rotates about
          the triangle's apex (its top-left corner near 12.034, 12.681) */}
      <motion.g
        variants={variants.pointer}
        initial="initial"
        animate={controls}
        style={{ transformOrigin: '12.5px 12.5px' }}
      >
        <path d="M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z" />
      </motion.g>
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function SquareDashedMousePointer(props: SquareDashedMousePointerProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  SquareDashedMousePointer,
  SquareDashedMousePointer as SquareDashedMousePointerIcon,
  type SquareDashedMousePointerProps,
  type SquareDashedMousePointerProps as SquareDashedMousePointerIconProps,
};
