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

// Hand-rolled animated variant of Lucide's `upload` (no upstream animate-ui
// version). Native icon so it animates on a parent <AnimateIcon> context
// (e.g. the toolbar button). The arrow lifts up and settles while the tray
// stays put. Geometry is Lucide v0.522.0 `upload` verbatim.
// See docs/motion/ICON_ANIMATIONS.md.

type UploadProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    arrow: {
      initial: { y: 0 },
      animate: {
        y: [0, -3, 0],
        transition: { duration: 0.6, ease: 'easeInOut', repeat: Number.POSITIVE_INFINITY },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, UploadProps>(function IconComponent({ size, ...props }, ref) {
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
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <motion.g variants={variants.arrow} initial="initial" animate={controls}>
        <path d="M12 3v12" />
        <path d="m17 8-5-5-5 5" />
      </motion.g>
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function Upload(props: UploadProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Upload,
  Upload as UploadIcon,
  type UploadProps,
  type UploadProps as UploadIconProps,
};
