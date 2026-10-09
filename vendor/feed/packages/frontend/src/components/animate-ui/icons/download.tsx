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

type DownloadProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    // Tray stays fixed
    tray: {
      initial: {},
      animate: {},
    },
    // Arrow (stem + chevron) bounces down
    arrow: {
      initial: { y: 0, transition: { type: 'spring', stiffness: 200, damping: 10, mass: 1 } },
      animate: { y: 2, transition: { type: 'spring', stiffness: 200, damping: 10, mass: 1 } },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, DownloadProps>(function IconComponent({ size, ...props }, ref) {
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
        d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
        variants={variants.tray}
        initial="initial"
        animate={controls}
      />
      <motion.g
        variants={variants.arrow}
        initial="initial"
        animate={controls}
      >
        <path d="M12 15V3" />
        <path d="m7 10 5 5 5-5" />
      </motion.g>
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function Download(props: DownloadProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Download,
  Download as DownloadIcon,
  type DownloadProps,
  type DownloadProps as DownloadIconProps,
};
