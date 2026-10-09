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

type GripProps = IconProps<keyof typeof animations>;

const CIRCLES = [
  { cx: 19, cy: 5 },
  { cx: 19, cy: 12 },
  { cx: 12, cy: 5 },
  { cx: 19, cy: 19 },
  { cx: 12, cy: 12 },
  { cx: 5, cy: 5 },
  { cx: 12, cy: 19 },
  { cx: 5, cy: 12 },
  { cx: 5, cy: 19 },
];

// Each circle has its own pulse variant with a unique stagger delay; mirrors
// the imperative-ref ui/grip.tsx (used in the sidebar) but built on the
// context-driven native animate-ui pattern so it can respond to AnimateIcon
// triggers from a parent button.
const pulse = (delay: number): Variants => ({
  initial: { opacity: 1 },
  animate: {
    opacity: [1, 0.3, 0.3, 1],
    transition: { duration: 1.1, delay, times: [0, 0.2, 0.8, 1] },
  },
});

const animations = {
  default: Object.fromEntries(
    CIRCLES.map((_, i) => [`c${i}`, pulse(i * 0.07)]),
  ) satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, GripProps>(function IconComponent({ size, ...props }, ref) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(animations);

  return (
    <motion.svg ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {CIRCLES.map((c, i) => (
        <motion.circle
          key={`${c.cx}-${c.cy}`}
          cx={c.cx}
          cy={c.cy}
          r={1}
          variants={variants[`c${i}` as keyof typeof variants]}
          initial="initial"
          animate={controls}
        />
      ))}
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function Grip(props: GripProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Grip,
  Grip as GripIcon,
  type GripProps,
  type GripProps as GripIconProps,
};
