// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React from 'react'
import { Badge } from '@/components/ui/badge'
import { Box, Package, AlertCircle, AlertTriangle, Tag, X } from "@/components/ui/icons";
import { cn } from '@/lib/utils'

const ICONS = {
  box: Box,
  package: Package,
  'alert-circle': AlertCircle,
  'alert-triangle': AlertTriangle,
  tag: Tag,
  x: X
} as const;

export interface StatusBadgeProps {
  label: string
  color: string
  icon: keyof typeof ICONS
  className?: string
  size?: 'default' | 'lg'
  showLabel?: boolean
}

export function StatusBadge({ 
  label, 
  color, 
  icon, 
  className,
  size = 'default',
  showLabel = true
}: StatusBadgeProps) {
  const Icon = ICONS[icon];
  
  return (
    <Badge 
      variant="outline" 
      className={cn(
        "flex items-center",
        showLabel ? "gap-1" : "justify-center",
        color,
        size === 'lg' && "text-sm px-3 py-1",
        !showLabel && "px-2 py-1",
        className
      )}
    >
      <Icon className={cn(
        "h-4 w-4",
        size === 'lg' && "h-5 w-5"
      )} />
      {showLabel && label}
    </Badge>
  );
}
