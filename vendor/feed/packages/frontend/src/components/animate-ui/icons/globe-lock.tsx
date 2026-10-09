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

// Hand-rolled animated variant of Lucide's `globe-lock`. No upstream
// animate-ui version exists, so this is authored as a native animate-ui icon
// (rather than an imperative-ref icon) specifically so it animates on a
// parent <AnimateIcon> context — e.g. the data-table toolbar wraps each
// button in <AnimateIcon animateOnHover>, and a native icon animates on
// whole-button hover, matching its sibling buttons. (An imperative-ref icon
// would only self-animate on direct icon hover; see ICON_ANIMATIONS.md.)
//
// Motion composition borrowed from existing icons:
//   - globe lines trace in (pathLength sweep, à la the Dribbble icon)
//   - the lock bobs and tips (group transform loop, à la the Folder-Lock icon)
// Geometry is Lucide v0.522.0 `globe-lock` verbatim, so it is visually
// identical to the static icon at rest.

type GlobeLockProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    lines: {
      initial: { pathLength: 1, pathOffset: 0, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        pathOffset: [1, 0],
        opacity: [0, 1],
        transition: { duration: 0.6, ease: 'linear', opacity: { duration: 0.1 } },
      },
    },
    lock: {
      initial: { y: 0, rotate: 0 },
      animate: {
        y: [0, -1.4, 0],
        rotate: [0, -4, 3, 0],
        transition: {
          duration: 0.7,
          ease: 'easeInOut',
          repeat: Number.POSITIVE_INFINITY,
        },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, GlobeLockProps>(function IconComponent({ size, ...props }, ref) {
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
        d="M15.686 15A14.5 14.5 0 0 1 12 22a14.5 14.5 0 0 1 0-20 10 10 0 1 0 9.542 13"
        variants={variants.lines}
        initial="initial"
        animate={controls}
      />
      <motion.path
        d="M2 12h8.5"
        variants={variants.lines}
        initial="initial"
        animate={controls}
      />
      <motion.g
        variants={variants.lock}
        initial="initial"
        animate={controls}
        style={{ transformOrigin: '18px 8px' }}
      >
        <path d="M20 6V4a2 2 0 1 0-4 0v2" />
        <rect width="8" height="5" x="14" y="6" rx="1" />
      </motion.g>
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function GlobeLock(props: GlobeLockProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  GlobeLock,
  GlobeLock as GlobeLockIcon,
  type GlobeLockProps,
  type GlobeLockProps as GlobeLockIconProps,
};
