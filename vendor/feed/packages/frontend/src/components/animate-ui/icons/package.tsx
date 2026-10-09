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

type PackageProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    box: {
      initial: { pathLength: 1, opacity: 1, pathOffset: 0 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        pathOffset: [1, 0],
        transition: { duration: 0.5, ease: 'linear', opacity: { duration: 0.1 } },
      },
    },
    equator: {
      initial: { pathLength: 1, opacity: 1, pathOffset: 0 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        pathOffset: [1, 0],
        transition: { duration: 0.35, ease: 'linear', delay: 0.15, opacity: { duration: 0.1 } },
      },
    },
    seam: {
      initial: { pathLength: 1, opacity: 1, pathOffset: 0 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        pathOffset: [1, 0],
        transition: { duration: 0.25, ease: 'linear', delay: 0.2, opacity: { duration: 0.1 } },
      },
    },
    centerLine: {
      initial: { pathLength: 1, opacity: 1, pathOffset: 0 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        pathOffset: [1, 0],
        transition: { duration: 0.2, ease: 'linear', delay: 0.3, opacity: { duration: 0.1 } },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, PackageProps>(function IconComponent({ size, ...props }, ref) {
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
        d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"
        variants={variants.box}
        initial="initial"
        animate={controls}
      />
      <motion.polyline
        points="3.29 7 12 12 20.71 7"
        variants={variants.equator}
        initial="initial"
        animate={controls}
      />
      <motion.path
        d="m7.5 4.27 9 5.15"
        variants={variants.seam}
        initial="initial"
        animate={controls}
      />
      <motion.path
        d="M12 22V12"
        variants={variants.centerLine}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function Package(props: PackageProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Package,
  Package as PackageIcon,
  type PackageProps,
  type PackageProps as PackageIconProps,
};
