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

type CalendarDaysProps = IconProps<keyof typeof animations>;

const DOTS = [
  { cx: 8, cy: 14 },
  { cx: 12, cy: 14 },
  { cx: 16, cy: 14 },
  { cx: 8, cy: 18 },
  { cx: 12, cy: 18 },
  { cx: 16, cy: 18 },
];

const blink = (delay: number): Variants => ({
  initial: { opacity: 1 },
  animate: {
    opacity: [1, 0.3, 1],
    transition: { duration: 0.4, delay, times: [0, 0.5, 1] },
  },
});

const animations = {
  default: Object.fromEntries(
    DOTS.map((_, i) => [`d${i}`, blink(i * 0.07)]),
  ) satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, CalendarDaysProps>(function IconComponent({ size, ...props }, ref) {
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
      {/* Static frame */}
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width={18} height={18} x={3} y={4} rx={2} />
      <path d="M3 10h18" />
      {/* Dots blink in cascade */}
      {DOTS.map((dot, i) => (
        <motion.circle
          key={`${dot.cx}-${dot.cy}`}
          cx={dot.cx}
          cy={dot.cy}
          r={1}
          fill="currentColor"
          stroke="none"
          variants={variants[`d${i}` as keyof typeof variants]}
          initial="initial"
          animate={controls}
        />
      ))}
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function CalendarDays(props: CalendarDaysProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  CalendarDays,
  CalendarDays as CalendarDaysIcon,
  type CalendarDaysProps,
  type CalendarDaysProps as CalendarDaysIconProps,
};
