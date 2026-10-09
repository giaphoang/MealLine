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

type SquarePenProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    penPath: {
      initial: { rotate: 0, x: 0, y: 0 },
      animate: {
        rotate: [-0.5, 0.5, -0.5, 0],
        x: [0, -1, 1.5, 0],
        y: [0, 1.5, -1, 0],
        transition: { duration: 0.6, ease: 'easeInOut' },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, SquarePenProps>(function IconComponent({ size, ...props }, ref) {
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
      style={{ overflow: 'visible' }}
      {...props}
    >
      <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <motion.path
        d="M18.375 2.625a1 1 0 1 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"
        variants={variants.penPath}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function SquarePen(props: SquarePenProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  SquarePen,
  SquarePen as SquarePenIcon,
  type SquarePenProps,
  type SquarePenProps as SquarePenIconProps,
};
