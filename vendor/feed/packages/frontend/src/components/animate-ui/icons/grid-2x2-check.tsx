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

type Grid2x2CheckProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    // Check stroke draws after the grid is shown
    check: {
      initial: { pathLength: 1, opacity: 1, pathOffset: 0 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        pathOffset: [1, 0],
        transition: {
          pathLength: { type: 'spring', duration: 0.4, bounce: 0, delay: 0.15 },
          opacity: { duration: 0.01, delay: 0.15 },
        },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, Grid2x2CheckProps>(function IconComponent({ size, ...props }, ref) {
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
      <path d="M12 3v17a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1H3" />
      <motion.path d="m16 19 2 2 4-4" variants={variants.check} initial="initial" animate={controls} />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function Grid2x2Check(props: Grid2x2CheckProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Grid2x2Check,
  Grid2x2Check as Grid2x2CheckIcon,
  type Grid2x2CheckProps,
  type Grid2x2CheckProps as Grid2x2CheckIconProps,
};
