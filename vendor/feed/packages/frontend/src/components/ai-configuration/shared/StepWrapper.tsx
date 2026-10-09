// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React from 'react'
import type { ComponentType } from 'react'
import { AnimateIcon } from '@/components/animate-ui/icons/icon'

// Accepts both native animate-ui icons (which take `size`) and Lucide icons
// (which accept their full LucideProps). Both ultimately render an svg.
// Using ComponentType<any> instead of a narrow {className, size} shape
// avoids TypeScript prop-variance errors when Lucide icons are passed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StepIcon = ComponentType<any>

interface StepWrapperProps {
  icon: StepIcon
  title: string
  description: string
  children: React.ReactNode
  suppressHeader?: boolean
}

export function StepWrapper({
  icon: Icon,
  title,
  description,
  children,
  suppressHeader = false
}: StepWrapperProps) {
  if (suppressHeader) {
    return (
      <div className="space-y-4">
        {children}
      </div>
    )
  }

  return (
    <div className="px-2">
      <div className="space-y-4">
        <div className="text-center">
          {/*
            Wrap the step icon so it animates on reveal (when the step
            content enters the viewport) and on direct hover. For native
            animate-ui icons this fires the icon's motion; for non-animate-ui
            icons the wrapper is a no-op but harmless.
          */}
          <AnimateIcon animateOnView animateOnViewOnce animateOnHover className="inline-block">
            <Icon className="h-12 w-12 mx-auto text-muted-foreground" size={48} />
          </AnimateIcon>
          <h3 className="mt-2 text-lg font-medium">{title}</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {description}
          </p>
        </div>
        <div className="space-y-4">
          {children}
        </div>
      </div>
    </div>
  )
}
