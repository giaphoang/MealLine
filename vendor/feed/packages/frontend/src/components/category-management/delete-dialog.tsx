// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client"

import { DeleteDialog as SharedDeleteDialog } from "@/components/shared/delete-dialog"
import { Category } from '@/types/category'

interface DeleteDialogProps {
  category: Category | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (category: Category) => Promise<void>
  onError?: (error: Error) => void
  isLoading?: boolean
}

export function DeleteDialog({
  category,
  open,
  onOpenChange,
  onConfirm,
  onError,
  isLoading
}: DeleteDialogProps) {
  return (
    <SharedDeleteDialog
      item={category}
      itemType="Category"
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      onError={onError}
      isLoading={isLoading}
    />
  )
}