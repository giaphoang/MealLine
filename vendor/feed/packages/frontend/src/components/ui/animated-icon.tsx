// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client"

import * as React from "react"
import type { LucideIcon } from "lucide-react";
import type { HTMLMotionProps, Variants } from "motion/react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

export type AnimatedIconVariant =
  | "default"
  | "subtle"
  | "draw"
  | "spin"
  | "pulse"
  | "danger"
  | "nav"

export interface AnimatedIconProps
  extends Omit<HTMLMotionProps<"span">, "children"> {
  icon: LucideIcon
  size?: number
  strokeWidth?: number
  iconClassName?: string
  variant?: AnimatedIconVariant
  disabled?: boolean
}

const entranceVariants: Variants = {
  hidden: (variant: AnimatedIconVariant) => ({
    opacity: variant === "subtle" ? 0.55 : 0,
    y: variant === "nav" ? 5 : 4,
    scale: variant === "subtle" ? 0.9 : 0.74,
  }),
  visible: (variant: AnimatedIconVariant) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: variant === "subtle" ? 0.56 : 0.82,
      ease: [0.22, 1, 0.36, 1],
    },
  }),
}

const continuousVariants: Variants = {
  still: {
    rotate: 0,
    scale: 1,
    opacity: 1,
  },
  spin: {
    rotate: 360,
    transition: {
      duration: 1.15,
      ease: "linear",
      repeat: Infinity,
    },
  },
  pulse: {
    scale: [1, 1.12, 1],
    opacity: [0.78, 1, 0.78],
    transition: {
      duration: 1.25,
      ease: [0.22, 1, 0.36, 1],
      repeat: Infinity,
    },
  },
  draw: {
    opacity: [0, 1],
    pathLength: [0, 1],
    transition: {
      duration: 0.82,
      ease: [0.22, 1, 0.36, 1],
    },
  },
}

const hoverByVariant: Record<
  AnimatedIconVariant,
  HTMLMotionProps<"span">["whileHover"]
> = {
  default: { scale: 1.12, y: -1 },
  subtle: { scale: 1.06, y: -1 },
  draw: { scale: 1.1, y: -1 },
  spin: { scale: 1.08 },
  pulse: { scale: 1.08 },
  danger: { scale: 1.12, y: -1, rotate: -4 },
  nav: { scale: 1.08, x: 1 },
}

export const AnimatedIcon = React.forwardRef<HTMLSpanElement, AnimatedIconProps>(
  (
    {
      icon: Icon,
      size = 16,
      strokeWidth = 2,
      className,
      iconClassName,
      variant = "default",
      disabled = false,
      ...props
    },
    ref
  ) => {
    const shouldReduceMotion = useReducedMotion()
    const motionDisabled = disabled || shouldReduceMotion
    const animateState =
      variant === "spin" || variant === "pulse" || variant === "draw"
        ? variant
        : "still"

    return (
      <motion.span
        ref={ref}
        aria-hidden="true"
        className={cn("inline-flex shrink-0 items-center justify-center", className)}
        custom={variant}
        data-feed-animated-icon="true"
        data-feed-icon-motion={variant}
        initial={motionDisabled ? false : "hidden"}
        animate={motionDisabled ? "still" : ["visible", animateState]}
        variants={{ ...entranceVariants, ...continuousVariants }}
        whileHover={motionDisabled ? undefined : hoverByVariant[variant]}
        whileTap={motionDisabled ? undefined : { scale: 0.88 }}
        transition={{ type: "spring", stiffness: 320, damping: 19 }}
        {...props}
      >
        <Icon
          className={iconClassName}
          size={size}
          strokeWidth={strokeWidth}
        />
      </motion.span>
    )
  }
)

AnimatedIcon.displayName = "AnimatedIcon"
