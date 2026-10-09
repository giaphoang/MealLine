// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client"

import { BulkDeleteDialog as SharedBulkDeleteDialog } from "@/components/shared/bulk-delete-dialog"
import { Category } from '@/types/category'

interface BulkDeleteDialogProps {
  categories: Category[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (categories: Category[]) => Promise<void>
  onError?: (error: Error) => void
  isLoading?: boolean
}

export function BulkDeleteDialog({
  categories,
  open,
  onOpenChange,
  onConfirm,
  onError,
  isLoading
}: BulkDeleteDialogProps) {
  return (
    <SharedBulkDeleteDialog
      items={categories}
      itemType="Category"
      pluralItemType="Categories"
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      onError={onError}
      isLoading={isLoading}
    />
  )
}
