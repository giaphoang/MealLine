// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React from 'react';
import type { LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from '@/lib/utils';

type IconDisplayIcon = LucideIcon | React.ComponentType<{ className?: string; size?: number }>;

interface IconDisplayProps {
  icon: IconDisplayIcon;
  size?: 'sm' | 'md' | 'lg';
  showTooltip?: boolean;
  tooltipContent?: string;
  className?: string;
}

/**
 * Shared icon display component for consistent icon rendering across tables
 * Supports any Lucide icon with configurable size and optional tooltip
 */
export function IconDisplay({ 
  icon: Icon, 
  size = 'sm', 
  showTooltip = false, 
  tooltipContent,
  className = '' 
}: IconDisplayProps) {
  // Size classes matching established patterns
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6'
  }[size];
  
  const iconElement = (
    <Icon className={cn(sizeClasses, 'text-muted-foreground', className)} />
  );
  
  if (showTooltip && tooltipContent) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {iconElement}
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltipContent}</p>
        </TooltipContent>
      </Tooltip>
    );
  }
  
  return iconElement;
}

// Export type for external use
export type { IconDisplayProps };
