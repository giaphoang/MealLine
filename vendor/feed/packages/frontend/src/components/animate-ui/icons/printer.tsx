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

type PrinterProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    slot: {
      initial: { pathLength: 1, opacity: 1, pathOffset: 0 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        pathOffset: [1, 0],
        transition: { duration: 0.4, ease: 'linear', opacity: { duration: 0.1 } },
      },
    },
    body: {
      initial: { pathLength: 1, opacity: 1, pathOffset: 0 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        pathOffset: [1, 0],
        transition: { duration: 0.4, ease: 'linear', delay: 0.2, opacity: { duration: 0.1 } },
      },
    },
    paper: {
      initial: { opacity: 1 },
      animate: {
        opacity: [0, 1],
        transition: { delay: 0.45, duration: 0.2 },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, PrinterProps>(function IconComponent({ size, ...props }, ref) {
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
        d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"
        variants={variants.slot}
        initial="initial"
        animate={controls}
      />
      <motion.path
        d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"
        variants={variants.body}
        initial="initial"
        animate={controls}
      />
      <motion.rect
        x="6"
        y="14"
        width="12"
        height="8"
        rx="1"
        variants={variants.paper}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function Printer(props: PrinterProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Printer,
  Printer as PrinterIcon,
  type PrinterProps,
  type PrinterProps as PrinterIconProps,
};
