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

type TagProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    tagPath: {
      initial: { pathLength: 1, opacity: 1, pathOffset: 0 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        pathOffset: [1, 0],
        transition: { duration: 0.6, ease: 'linear', opacity: { duration: 0.1 } },
      },
    },
    dot: {
      initial: { opacity: 1 },
      animate: {
        opacity: [0, 1],
        transition: { delay: 0.4, duration: 0.2 },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, TagProps>(function IconComponent({ size, ...props }, ref) {
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
        d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"
        variants={variants.tagPath}
        initial="initial"
        animate={controls}
      />
      <motion.circle
        cx="7.5"
        cy="7.5"
        r=".5"
        fill="currentColor"
        stroke="none"
        variants={variants.dot}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function Tag(props: TagProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Tag,
  Tag as TagIcon,
  type TagProps,
  type TagProps as TagIconProps,
};
