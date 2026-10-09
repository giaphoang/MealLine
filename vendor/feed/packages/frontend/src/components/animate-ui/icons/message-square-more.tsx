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

type MessageSquareMoreProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    group: {
      initial: { rotate: 0 },
      animate: {
        transformOrigin: 'bottom left',
        rotate: [0, 8, -8, 2, 0],
        transition: {
          ease: 'easeInOut',
          duration: 0.8,
          times: [0, 0.4, 0.6, 0.8, 1],
        },
      },
    },
    line1: {
      initial: { y1: 10, y2: 10 },
      animate: {
        y1: [10, 8.5, 10],
        y2: [10, 11.5, 10],
        transition: { ease: 'easeInOut', duration: 0.6, delay: 0.2 },
      },
    },
    line2: {
      initial: { y1: 10, y2: 10 },
      animate: {
        y1: [10, 8.5, 10],
        y2: [10, 11.5, 10],
        transition: { ease: 'easeInOut', duration: 0.6, delay: 0.1 },
      },
    },
    line3: {
      initial: { y1: 10, y2: 10 },
      animate: {
        y1: [10, 8.5, 10],
        y2: [10, 11.5, 10],
        transition: { ease: 'easeInOut', duration: 0.6 },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, MessageSquareMoreProps>(function IconComponent({ size, ...props }, ref) {
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
      <motion.g variants={variants.group} initial="initial" animate={controls}>
        {/* Bubble (static within the group) — fixed truncated Lucide path */}
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        {/* Three dots, rendered as motion.line so we can animate y1/y2 to
            create a brief vertical "bounce" — sequenced right-to-left */}
        <motion.line
          x1={16}
          y1={10}
          x2={16}
          y2={10}
          variants={variants.line1}
          initial="initial"
          animate={controls}
        />
        <motion.line
          x1={12}
          y1={10}
          x2={12}
          y2={10}
          variants={variants.line2}
          initial="initial"
          animate={controls}
        />
        <motion.line
          x1={8}
          y1={10}
          x2={8}
          y2={10}
          variants={variants.line3}
          initial="initial"
          animate={controls}
        />
      </motion.g>
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function MessageSquareMore(props: MessageSquareMoreProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  MessageSquareMore,
  MessageSquareMore as MessageSquareMoreIcon,
  type MessageSquareMoreProps,
  type MessageSquareMoreProps as MessageSquareMoreIconProps,
};
