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

type LanguagesProps = IconProps<keyof typeof animations>;

const draw = (delay: number): Variants => ({
  initial: { pathLength: 1, opacity: 1, pathOffset: 0 },
  animate: {
    pathLength: [0, 1],
    opacity: [0, 1],
    pathOffset: [1, 0],
    transition: {
      pathLength: { type: 'spring', duration: 0.5, bounce: 0, delay },
      opacity: { duration: 0.01, delay },
    },
  },
});

const animations = {
  default: {
    p0: draw(0),
    p1: draw(0.1),
    p2: draw(0.2),
    p3: draw(0.3),
    p4: draw(0.3),
    p5: draw(0.35),
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, LanguagesProps>(function IconComponent({ size, ...props }, ref) {
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
      <motion.path d="M7 2h1" variants={variants.p0} initial="initial" animate={controls} />
      <motion.path d="M2 5h12" variants={variants.p1} initial="initial" animate={controls} />
      <motion.path d="m4 14 6-6 2-3" variants={variants.p2} initial="initial" animate={controls} />
      <motion.path d="m5 8 6 6" variants={variants.p3} initial="initial" animate={controls} />
      <motion.path d="m22 22-5-10-5 10" variants={variants.p4} initial="initial" animate={controls} />
      <motion.path d="M14 18h6" variants={variants.p5} initial="initial" animate={controls} />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function Languages(props: LanguagesProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Languages,
  Languages as LanguagesIcon,
  type LanguagesProps,
  type LanguagesProps as LanguagesIconProps,
};
