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

type Trash2Props = IconProps<keyof typeof animations>;

const animations = {
  default: {
    lidGroup: {
      initial: { y: 0 },
      animate: {
        y: [0, -1.1, -1.1, 0],
        transition: { duration: 0.5, ease: 'easeInOut', times: [0, 0.3, 0.7, 1] },
      },
    },
    bodyGroup: {
      initial: { y: 0 },
      animate: {
        y: [0, 1, 1, 0],
        transition: { duration: 0.5, ease: 'easeInOut', times: [0, 0.3, 0.7, 1] },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, Trash2Props>(function IconComponent({ size, ...props }, ref) {
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
      <motion.g
        variants={variants.lidGroup}
        initial="initial"
        animate={controls}
      >
        <path d="M3 6h18" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </motion.g>
      <motion.g
        variants={variants.bodyGroup}
        initial="initial"
        animate={controls}
      >
        <path d="M19 8v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8" />
        <line x1="10" x2="10" y1="11" y2="17" />
        <line x1="14" x2="14" y1="11" y2="17" />
      </motion.g>
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function Trash2(props: Trash2Props) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Trash2,
  Trash2 as Trash2Icon,
  type Trash2Props,
  type Trash2Props as Trash2IconProps,
};
