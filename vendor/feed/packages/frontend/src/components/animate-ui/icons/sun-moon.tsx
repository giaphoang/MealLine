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

type SunMoonProps = IconProps<keyof typeof animations>;

const animations = {
  default: (() => {
    const animation: Record<string, Variants> = {
      mainPath: {
        initial: { rotate: 0 },
        animate: {
          rotate: [0, -5, 5, -2, 2, 0],
          transition: { duration: 1.5, ease: 'easeInOut' },
        },
      },
    };

    for (let i = 1; i <= 8; i++) {
      animation[`ray${i}`] = {
        initial: { opacity: 1 },
        animate: {
          opacity: [0, 1],
          transition: { delay: i * 0.1, duration: 0.3 },
        },
      };
    }

    return animation;
  })() satisfies Record<string, Variants>,
} as const;

const RAY_PATHS = [
  'M12 2v2',
  'M12 20v2',
  'm4.9 4.9 1.4 1.4',
  'm17.7 17.7 1.4 1.4',
  'M2 12h2',
  'M20 12h2',
  'm6.3 17.7-1.4 1.4',
  'm19.1 4.9-1.4 1.4',
] as const;

const IconComponent = React.forwardRef<SVGSVGElement, SunMoonProps>(function IconComponent({ size, ...props }, ref) {
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
      <motion.g
        variants={variants.mainPath}
        initial="initial"
        animate={controls}
      >
        <path d="M12 8a2.83 2.83 0 0 0 4 4 4 4 0 1 1-4-4" />
      </motion.g>
      {RAY_PATHS.map((d, i) => (
        <motion.path
          key={d}
          d={d}
          variants={variants[`ray${i + 1}`]}
          initial="initial"
          animate={controls}
        />
      ))}
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function SunMoon(props: SunMoonProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  SunMoon,
  SunMoon as SunMoonIcon,
  type SunMoonProps,
  type SunMoonProps as SunMoonIconProps,
};
