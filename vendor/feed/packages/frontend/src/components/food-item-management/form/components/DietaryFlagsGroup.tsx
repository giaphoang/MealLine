// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import * as React from "react"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { DietaryFlags, FOOD_ITEM_SECTIONS } from "@/types/food-item"

interface DietaryFlagsGroupProps {
  value: DietaryFlags
  onChange: (flag: keyof DietaryFlags, checked: boolean) => void
  disabled?: boolean
}

export const dietaryFlagItems = [
  {
    id: "vegan",
    label: "Vegan",
    description: "Contains no animal products"
  },
  {
    id: "vegetarian",
    label: "Vegetarian",
    description: "Contains no meat products"
  },
  {
    id: "glutenFree",
    label: "Gluten Free",
    description: "Contains no gluten"
  },
  {
    id: "organic",
    label: "Organic",
    description: "Made with organic ingredients"
  },
  {
    id: "halal",
    label: "Halal",
    description: "Prepared according to Islamic law"
  },
  {
    id: "kosher",
    label: "Kosher",
    description: "Prepared according to Jewish law"
  },
  {
    id: "readyToEat",
    label: "Ready to Eat",
    description: "No preparation required"
  }
] as const;

export function DietaryFlagsGroup({
  value,
  onChange,
  disabled = false
}: DietaryFlagsGroupProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label className="text-base">{FOOD_ITEM_SECTIONS.DIETARY}</Label>
        <p className="text-sm text-muted-foreground">
          Select all applicable dietary flags for this item.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {dietaryFlagItems.map((item) => (
          <div
            key={item.id}
            className="flex flex-row items-start space-x-3 space-y-0"
          >
            <Checkbox
              checked={value[item.id as keyof DietaryFlags]}
              onCheckedChange={(checked) => {
                onChange(item.id as keyof DietaryFlags, checked === true);
              }}
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
    </div>
  );
}