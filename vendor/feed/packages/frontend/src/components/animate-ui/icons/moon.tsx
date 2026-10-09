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

type MoonProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    path: {
      initial: {
        rotate: 0,
        transition: {
          duration: 0.5,
          ease: 'easeInOut',
        },
      },
      animate: {
        rotate: [0, -30, 400, 360],
        transition: {
          duration: 1.2,
          times: [0, 0.25, 0.75, 1],
          ease: ['easeInOut', 'easeInOut', 'easeInOut'],
        },
      },
    },
  } satisfies Record<string, Variants>,
  balancing: {
    path: {
      initial: {
        rotate: 0,
        transition: {
          duration: 0.5,
          ease: 'easeInOut',
        },
      },
      animate: {
        rotate: [0, -30, 25, -15, 10, -5, 0],
        transition: {
          duration: 1.2,
          ease: 'easeInOut',
        },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, MoonProps>(function IconComponent({ size, ...props }, ref) {
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
      initial="initial"
      animate={controls}
      {...props}
    >
      <motion.path
        d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"
        variants={variants.path}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function Moon(props: MoonProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Moon,
  Moon as MoonIcon,
  type MoonProps,
  type MoonProps as MoonIconProps,
};
