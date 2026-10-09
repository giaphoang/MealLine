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

// Hand-rolled animated variant of Lucide's `panel-left-close` (no upstream
// animate-ui version). Native icon so it animates via a parent <AnimateIcon>
// context — the sidebar toggle button wraps it in <AnimateIcon animateOnHover
// animateOnTap>. The chevron nudges left on hover, signalling "collapse".
// Panel + divider stay put. Geometry is Lucide v0.522.0 `panel-left-close`
// verbatim. See docs/motion/ICON_ANIMATIONS.md.

type PanelLeftCloseProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    chevron: {
      initial: { x: 0 },
      animate: {
        x: [0, -2.5, 0],
        transition: { duration: 0.5, ease: 'easeInOut' },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

const IconComponent = React.forwardRef<SVGSVGElement, PanelLeftCloseProps>(function IconComponent({ size, ...props }, ref) {
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
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
      <motion.path
        d="m16 15-3-3 3-3"
        variants={variants.chevron}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
});
IconComponent.displayName = 'IconComponent';

function PanelLeftClose(props: PanelLeftCloseProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  PanelLeftClose,
  PanelLeftClose as PanelLeftCloseIcon,
  type PanelLeftCloseProps,
  type PanelLeftCloseProps as PanelLeftCloseIconProps,
};
