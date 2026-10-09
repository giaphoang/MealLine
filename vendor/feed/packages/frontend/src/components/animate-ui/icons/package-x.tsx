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

type PackageXProps = IconProps<keyof typeof animations>;

const drawX = (delay: number): Variants => ({
  initial: { pathLength: 1, opacity: 1, pathOffset: 0 },
  animate: {
    pathLength: [0, 1],
    opacity: [0, 1],
    pathOffset: [1, 0],
    transition: {
      pathLength: { type: 'spring', duration: 0.35, bounce: 0, delay },
      opacity: { duration: 0.01, delay },
    },
  },
});

const animations = {
  default: {
    xDown: drawX(0),
    xUp: drawX(0.15),
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, PackageXProps>(function IconComponent({ size, ...props }, ref) {
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
      {/* Box outline stays static */}
      <path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14" />
      <path d="M16.5 9.4 7.55 4.24" />
      <polyline points="3.29 7 12 12 20.71 7" />
      <path d="M12 22V12" />
      {/* X strokes draw on top */}
      <motion.path d="m17 17 5 5" variants={variants.xDown} initial="initial" animate={controls} />
      <motion.path d="m22 17-5 5" variants={variants.xUp} initial="initial" animate={controls} />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function PackageX(props: PackageXProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  PackageX,
  PackageX as PackageXIcon,
  type PackageXProps,
  type PackageXProps as PackageXIconProps,
};
