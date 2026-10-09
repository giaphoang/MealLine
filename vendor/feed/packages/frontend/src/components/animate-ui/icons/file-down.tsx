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

type FileDownProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    // Arrow (stem + chevron) bounces down and returns
    arrow: {
      initial: { y: 0 },
      animate: {
        y: [0, 2, 0],
        transition: { times: [0, 0.4, 1], duration: 0.5 },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, FileDownProps>(function IconComponent({ size, ...props }, ref) {
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
      {/* File body and fold corner stay fixed */}
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      {/* Arrow stem + chevron animate as a unit */}
      <motion.g
        variants={variants.arrow}
        initial="initial"
        animate={controls}
      >
        <path d="M12 18v-6" />
        <path d="m9 15 3 3 3-3" />
      </motion.g>
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function FileDown(props: FileDownProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  FileDown,
  FileDown as FileDownIcon,
  type FileDownProps,
  type FileDownProps as FileDownIconProps,
};
