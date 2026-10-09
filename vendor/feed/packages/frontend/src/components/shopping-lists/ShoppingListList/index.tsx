// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useCallback, useState, useRef } from "react"
import { builderTemplateColumns } from "../data-table/builder-template-columns"
import { DataList } from "@/components/shared/data-list/DataList"
import { createPageTitleIcon } from "@/components/layout/page-title-icon";
import { TooltipProvider } from "@/components/ui/tooltip"
import { TableBulkAction } from "@/types/table"
import { SavedBuilderTemplate } from "@/components/shopping-lists/builder/types"
import { GlobalLimitDialog } from "../global-limit-dialog"
import { Trash2, Download, Copy } from "@/components/ui/icons";
import { ClipboardPenIcon } from "@/components/ui/clipboard-pen";
import { PlusIcon } from "@/components/animate-ui/icons/plus";
import { SquareArrowOutUpRightIcon } from "@/components/animate-ui/icons/square-arrow-out-up-right";
import { GlobeLockIcon } from "@/components/animate-ui/icons/globe-lock";

const PageTitleClipboardPenIcon = createPageTitleIcon(ClipboardPenIcon);

interface ShoppingListListProps {
  builderTemplates: SavedBuilderTemplate[]
  isLoadingBuilderTemplates?: boolean
  onOpenBuilder?: () => void
  onRenameBuilderTemplate?: (template: SavedBuilderTemplate) => void
  onDeleteBuilderTemplate?: (template: SavedBuilderTemplate) => void
  onDuplicateBuilderTemplate?: (template: SavedBuilderTemplate) => void
  onEditBuilderTemplate?: (template: SavedBuilderTemplate) => void
  onPrintBuilderTemplate?: (template: SavedBuilderTemplate) => void
  onDownloadBuilderTemplatePdf?: (template: SavedBuilderTemplate) => void
  onTranslateAndDownloadBuilderTemplatePdf?: (template: SavedBuilderTemplate) => void
  onBulkDownloadBuilderTemplatePdfs?: (templates: SavedBuilderTemplate[]) => Promise<void> | void
  onBulkDuplicateBuilderTemplates?: (templates: SavedBuilderTemplate[]) => Promise<void> | void
  onBulkDeleteBuilderTemplates?: (templates: SavedBuilderTemplate[]) => Promise<void> | void
  onOpenExportSettings?: () => void
}

/**
 * Shopping Lists list view (v1.0.0): manages saved builder templates only.
 *
 * Pre-1.0 this component supported a dual mode (unified items from the
 * wizard era + builder templates). The wizard subgraph was removed in
 * v1.0.0; this view is now purely builder-template management.
 */
export function ShoppingListList({
  builderTemplates,
  isLoadingBuilderTemplates,
  onOpenBuilder,
  onRenameBuilderTemplate,
  onDeleteBuilderTemplate,
  onDuplicateBuilderTemplate,
  onEditBuilderTemplate,
  onPrintBuilderTemplate,
  onDownloadBuilderTemplatePdf,
  onTranslateAndDownloadBuilderTemplatePdf,
  onBulkDownloadBuilderTemplatePdfs,
  onBulkDuplicateBuilderTemplates,
  onBulkDeleteBuilderTemplates,
  onOpenExportSettings,
}: ShoppingListListProps) {
  const dataListRef = useRef<{ clearSelection: () => void } | null>(null)
  const [globalLimitDialogOpen, setGlobalLimitDialogOpen] = useState(false)

  const handleDataListRef = useCallback((dataList: { clearSelection: () => void } | null) => {
    dataListRef.current = dataList;
  }, []);

  const handleError = useCallback((error: Error) => {
    console.error('ShoppingListList error:', error);
  }, [])

  const handleBulkDownloadBuilderTemplates = useCallback(async (selected: SavedBuilderTemplate[]) => {
    if (!onBulkDownloadBuilderTemplatePdfs) return;
    await onBulkDownloadBuilderTemplatePdfs(selected);
    dataListRef.current?.clearSelection?.();
  }, [onBulkDownloadBuilderTemplatePdfs])

  const handleBulkDuplicateBuilderTemplates = useCallback(async (selected: SavedBuilderTemplate[]) => {
    if (!onBulkDuplicateBuilderTemplates) return;
    await onBulkDuplicateBuilderTemplates(selected);
    dataListRef.current?.clearSelection?.();
  }, [onBulkDuplicateBuilderTemplates])

  const handleBulkDeleteBuilderTemplates = useCallback(async (selected: SavedBuilderTemplate[]) => {
    if (!onBulkDeleteBuilderTemplates) return;
    await onBulkDeleteBuilderTemplates(selected);
    dataListRef.current?.clearSelection?.();
  }, [onBulkDeleteBuilderTemplates])

  const toolbarActions = [
    {
      label: 'Create Template',
      icon: PlusIcon,
      variant: 'default' as const,
      action: () => onOpenBuilder?.()
    },
    {
      label: 'Global Limit Settings',
      icon: GlobeLockIcon,
      variant: 'outline' as const,
      action: () => setGlobalLimitDialogOpen(true)
    },
    ...(onOpenExportSettings ? [{
      label: 'Export Settings',
      icon: SquareArrowOutUpRightIcon,
      variant: 'outline' as const,
      action: () => onOpenExportSettings()
    }] : [])
  ]

  const builderTemplateBulkActions: TableBulkAction<SavedBuilderTemplate>[] = [
    ...(onBulkDownloadBuilderTemplatePdfs ? [{
      label: 'Download Selected',
      icon: Download,
      action: handleBulkDownloadBuilderTemplates,
      variant: 'default' as const
    }] : []),
    ...(onBulkDuplicateBuilderTemplates ? [{
      label: 'Duplicate Selected',
      icon: Copy,
      action: handleBulkDuplicateBuilderTemplates,
      variant: 'default' as const
    }] : []),
    ...(onBulkDeleteBuilderTemplates ? [{
      label: 'Delete Selected',
      icon: Trash2,
      action: handleBulkDeleteBuilderTemplates,
      variant: 'destructive' as const
    }] : [])
  ]

  return (
    <div className="space-y-6 min-w-0 w-full" data-testid="shopping-list-data-list">
      <TooltipProvider>
        <DataList
          ref={handleDataListRef}
          title="Shopping Lists"
          description="Create and manage saved shopping list templates"
          items={builderTemplates}
          columns={builderTemplateColumns({
            onRename: onRenameBuilderTemplate ?? (() => undefined),
            onDelete: onDeleteBuilderTemplate ?? (() => undefined),
            onDuplicate: onDuplicateBuilderTemplate ?? (() => undefined),
            onEdit: onEditBuilderTemplate ?? (() => undefined),
            onPrint: onPrintBuilderTemplate ?? (() => undefined),
            onDownloadPdf: onDownloadBuilderTemplatePdf ?? (() => undefined),
            onTranslateAndDownloadPdf: onTranslateAndDownloadBuilderTemplatePdf ?? (() => undefined),
          })}
          isLoading={isLoadingBuilderTemplates ?? false}
          bulkActions={builderTemplateBulkActions}
          filterColumn="name"
          filterPlaceholder="Filter saved templates..."
          enableColumnVisibility={true}
          onError={handleError}
          toolbarIcon={PageTitleClipboardPenIcon}
          toolbarActions={toolbarActions}
        />
      </TooltipProvider>

      <GlobalLimitDialog
        open={globalLimitDialogOpen}
        onOpenChange={setGlobalLimitDialogOpen}
      />
    </div>
  )
}
