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
  IconWrapper,
  useAnimateIconContext,
  type IconProps,
} from '@/components/animate-ui/icons/icon';

// Native animate-ui variant of Lucide v0.522.0 `file-spreadsheet`.
// Geometry is copied verbatim so the resting icon matches Lucide exactly.
// Each child path traces independently; animation controls intentionally live
// on the paths rather than the SVG root (ICON_ANIMATIONS.md).
type FileSpreadsheetProps = IconProps<keyof typeof animations>;

const trace = (delay: number, duration: number): Variants => ({
  initial: { pathLength: 1, pathOffset: 0, opacity: 1 },
  animate: {
    pathLength: [0, 1],
    pathOffset: [1, 0],
    opacity: [0, 1],
    transition: {
      delay,
      duration,
      ease: 'easeInOut',
      opacity: { delay, duration: 0.1 },
    },
  },
});

const animations = {
  default: {
    body: trace(0, 0.55),
    fold: trace(0.14, 0.35),
    cellOne: trace(0.3, 0.24),
    cellTwo: trace(0.38, 0.24),
    cellThree: trace(0.46, 0.24),
    cellFour: trace(0.54, 0.24),
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, FileSpreadsheetProps>(
  function IconComponent({ size, ...props }, ref) {
    const { controls } = useAnimateIconContext();
    const variants = getVariants(animations);

    return (
      <motion.svg
        ref={ref}
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
          d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"
          variants={variants.body}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="M14 2v4a2 2 0 0 0 2 2h4"
          variants={variants.fold}
          initial="initial"
          animate={controls}
        />
        <motion.path d="M8 13h2" variants={variants.cellOne} initial="initial" animate={controls} />
        <motion.path d="M14 13h2" variants={variants.cellTwo} initial="initial" animate={controls} />
        <motion.path d="M8 17h2" variants={variants.cellThree} initial="initial" animate={controls} />
        <motion.path d="M14 17h2" variants={variants.cellFour} initial="initial" animate={controls} />
      </motion.svg>
    );
  },
);
IconComponent.displayName = 'IconComponent';

function FileSpreadsheet(props: FileSpreadsheetProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  FileSpreadsheet,
  FileSpreadsheet as FileSpreadsheetIcon,
  type FileSpreadsheetProps,
  type FileSpreadsheetProps as FileSpreadsheetIconProps,
};
