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

type TypeProps = IconProps<keyof typeof animations>;

const draw = (delay: number): Variants => ({
  initial: { pathLength: 1, opacity: 1, pathOffset: 0 },
  animate: {
    pathLength: [0, 1],
    opacity: [0, 1],
    pathOffset: [1, 0],
    transition: {
      pathLength: { type: 'spring', duration: 0.4, bounce: 0, delay },
      opacity: { duration: 0.01, delay },
    },
  },
});

const animations = {
  default: {
    top: draw(0),
    stem: draw(0.15),
    bottom: draw(0.3),
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, TypeProps>(function IconComponent({ size, ...props }, ref) {
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
      <motion.path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2" variants={variants.top} initial="initial" animate={controls} />
      <motion.path d="M12 4v16" variants={variants.stem} initial="initial" animate={controls} />
      <motion.path d="M9 20h6" variants={variants.bottom} initial="initial" animate={controls} />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function Type(props: TypeProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Type,
  Type as TypeIcon,
  type TypeProps,
  type TypeProps as TypeIconProps,
};
