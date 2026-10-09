// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import * as React from "react"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { StatusBadge } from "@/components/ui/status-badge"
import { StatusFlags, STATUS_DISPLAY_CONFIG } from '@/types/food-item'
import { cn } from '@/lib/utils'

interface StatusFlagsGroupProps {
  value: StatusFlags
  onChange: (key: keyof StatusFlags) => void
  disabled?: boolean
  variant?: 'inline' | 'accordion'
  className?: string
}

const statusFlagItems = [
  {
    id: "isInStock",
    ...STATUS_DISPLAY_CONFIG.IN_STOCK
  },
  {
    id: "isLimited",
    ...STATUS_DISPLAY_CONFIG.LIMITED
  },
  {
    id: "isClearance",
    ...STATUS_DISPLAY_CONFIG.CLEARANCE
  }
] as const;

export function StatusFlagsGroup({
  value,
  onChange,
  disabled = false,
  variant = 'accordion',
  className
}: StatusFlagsGroupProps) {
  const anyFlagActive = Object.values(value).some(Boolean);
  const isOutOfStock = !value.isInStock;

  const FlagList = (
    <div className="grid grid-cols-2 gap-4">
      {statusFlagItems.map((item) => (
        <div
          key={item.id}
          className="flex flex-row items-start space-x-3 space-y-0"
        >
          <Checkbox
            checked={value[item.id as keyof StatusFlags]}
            onCheckedChange={() => onChange(item.id as keyof StatusFlags)}
            disabled={disabled}
          />
          <div className="space-y-1 leading-none">
            <Label className="text-sm font-normal">
              {item.label}
            </Label>
            <p className="text-sm text-muted-foreground">
              {item.description}
            </p>
          </div>
        </div>
      ))}
    </div>
  );

  const StatusDisplay = (
    <div className="flex flex-wrap gap-2 py-2">
      {isOutOfStock ? (
        <StatusBadge
          label={STATUS_DISPLAY_CONFIG.OUT_OF_STOCK.label}
          color={STATUS_DISPLAY_CONFIG.OUT_OF_STOCK.color}
          icon={STATUS_DISPLAY_CONFIG.OUT_OF_STOCK.icon as "box" | "package" | "alert-circle" | "alert-triangle" | "tag" | "x"}
          size="lg"
        />
      ) : (
        anyFlagActive && statusFlagItems.map(item => (
          value[item.id as keyof StatusFlags] && (
            <StatusBadge
              key={item.id}
              label={item.label}
              color={item.color}
              icon={item.icon as "box" | "package" | "alert-circle" | "alert-triangle" | "tag" | "x"}
              size="lg"
            />
          )
        ))
      )}
    </div>
  );

  if (variant === 'inline') {
    return (
      <div className={cn("space-y-4", className)}>
        {StatusDisplay}
        {FlagList}
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="space-y-1">
        <Label className="text-base">Item Status</Label>
        <p className="text-sm text-muted-foreground">
          Select all applicable statuses. Item is considered out of stock when not marked as "In Stock".
        </p>
      </div>
      {StatusDisplay}
      {FlagList}
    </div>
  );
}