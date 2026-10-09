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

// Hand-rolled animated variant of Lucide's `folder-check` (no upstream
// animate-ui version). Native icon so it animates on a parent <AnimateIcon>
// context (e.g. the toolbar button). The checkmark draws on while the folder
// stays put. Geometry is Lucide v0.522.0 `folder-check` verbatim.
// See docs/motion/ICON_ANIMATIONS.md.

type FolderCheckProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    check: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.5, ease: 'easeOut', opacity: { duration: 0.1 } },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, FolderCheckProps>(function IconComponent({ size, ...props }, ref) {
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
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
      <motion.path
        d="m9 13 2 2 4-4"
        variants={variants.check}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function FolderCheck(props: FolderCheckProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  FolderCheck,
  FolderCheck as FolderCheckIcon,
  type FolderCheckProps,
  type FolderCheckProps as FolderCheckIconProps,
};
