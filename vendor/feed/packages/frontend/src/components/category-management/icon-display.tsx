// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React from 'react';
import { getIconComponent, DEFAULT_ICON } from '@/lib/food-icons';
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface IconDisplayProps {
  iconName?: string;
  size?: 'sm' | 'md' | 'lg';
  showTooltip?: boolean;
  className?: string;
}

export function IconDisplay({ iconName, size = 'md', showTooltip = true, className = '' }: IconDisplayProps) {
  const IconComponent = getIconComponent(iconName || DEFAULT_ICON);
  
  // Determine size classes
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6'
  }[size];
  
  const icon = (
    <IconComponent className={`${sizeClasses} ${className}`} />
  );
  
  if (showTooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {icon}
        </TooltipTrigger>
        <TooltipContent>
          <p>{iconName || DEFAULT_ICON}</p>
        </TooltipContent>
      </Tooltip>
    );
  }
  
  return icon;
}
