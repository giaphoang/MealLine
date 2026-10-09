// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { TableBulkAction } from "@/types/table"
import { Category } from "@/types/category"
import { Trash2 } from "@/components/ui/icons";

export function createCategoryBulkActions(
  onDelete: (categories: Category[]) => Promise<void>
): TableBulkAction<Category>[] {
  return [
    {
      label: "Delete Selected",
      icon: Trash2,
      action: onDelete,
      variant: "destructive",
    }
  ]
}