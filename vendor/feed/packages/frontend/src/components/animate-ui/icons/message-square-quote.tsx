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

type MessageSquareQuoteProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    // Whole speech bubble wobbles from its bottom-left tail
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
    // The two quote glyphs nudge slightly to emphasize "speech"
    quoteLeft: {
      initial: { x: 0, y: 0 },
      animate: {
        x: [0, 1.5, 0],
        y: [0, -0.5, 0],
        transition: { duration: 0.6, ease: 'easeInOut' },
      },
    },
    quoteRight: {
      initial: { x: 0, y: 0 },
      animate: {
        x: [0, 1, 0],
        y: [0, -0.5, 0],
        transition: { duration: 0.6, ease: 'easeInOut' },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, MessageSquareQuoteProps>(function IconComponent({ size, ...props }, ref) {
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
        {/* Bubble (static within the group; group wobbles as a whole) */}
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <motion.path
          d="M8 12a2 2 0 0 0 2-2V8H8"
          variants={variants.quoteLeft}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="M14 12a2 2 0 0 0 2-2V8h-2"
          variants={variants.quoteRight}
          initial="initial"
          animate={controls}
        />
      </motion.g>
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function MessageSquareQuote(props: MessageSquareQuoteProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  MessageSquareQuote,
  MessageSquareQuote as MessageSquareQuoteIcon,
  type MessageSquareQuoteProps,
  type MessageSquareQuoteProps as MessageSquareQuoteIconProps,
};
