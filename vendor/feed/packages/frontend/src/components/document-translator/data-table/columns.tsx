// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React from "react"
import { ColumnDef } from "@tanstack/react-table"
import { AlertTriangle } from "@/components/ui/icons";
import { DownloadIcon } from "@/components/animate-ui/icons/download";
import { LanguagesIcon } from "@/components/animate-ui/icons/languages";
import { FileDownIcon } from "@/components/animate-ui/icons/file-down";
import { SquarePenIcon } from "@/components/animate-ui/icons/square-pen";
import { Trash2Icon } from "@/components/animate-ui/icons/trash-2";
import { Document } from "../types"
import { TableRowAction } from "@/types/table"
import { Checkbox } from "@/components/ui/checkbox"
import { TableActionMenu } from "@/components/ui/table-action-menu"
import { ResponsiveTruncatedText } from "@/components/ui/responsive-truncated-text"
import { useIsMobile } from "@/hooks/use-mobile"
import { SortableHeader } from "@/components/ui/sortable-header"
import { formatDate } from '@/lib/formatting/date'

/**
 * The name cell, extracted from an inline `cell` renderer.
 *
 * It calls hooks, and a column definition's `cell` is a plain function rather
 * than a component — React has no stable identity to attach hook state to, so
 * the order is not guaranteed across renders. Extracting it into a real
 * component makes the hooks legitimate rather than incidentally working.
 *
 * The inline version also re-implemented mobile detection with its own resize
 * listener and a hard-coded 768 breakpoint; `useIsMobile` already owns that at
 * the same breakpoint.
 */
function DocumentNameCell({ document }: { document: Document }) {
  const isMobile = useIsMobile()

  return (
    <div className="min-w-0">
      <div className="font-medium flex items-center gap-2 min-w-0">
        <ResponsiveTruncatedText
          text={document.name}
          title="View full document name"
          className="flex-1 min-w-0"
        />
        {/* Show warning icon if file has integrity issues */}
        {document.hasIntegrityIssue && (
          <span className="shrink-0" title={document.wasCleared ?
            "This file is missing and has been marked unavailable" :
            "This file has integrity issues and may not be accessible"}>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </span>
        )}
      </div>
      {/* Show mobile-only info for hidden columns */}
      {isMobile && (
        <div className="text-xs text-muted-foreground mt-1">
          {document.type === 'original' ? 'Original' : `Translation (${document.language})`}
          {document.fileSize && ` · ${document.fileSize}`}
          {document.hasIntegrityIssue && (
            <span className="text-amber-500 ml-1">
              {document.wasCleared ? '· Unavailable' : '· Warning'}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

interface DocumentActionProps {
  onEdit: (document: Document) => void
  onDelete: (document: Document) => void
  onTranslate: (document: Document) => void
  onDownload: (document: Document) => void
  onDownloadAllTranslations: (document: Document) => Promise<void>
}

export function getColumns(
  onEdit: (document: Document) => void,
  onDelete: (document: Document) => void,
  onTranslate: (document: Document) => void,
  onDownload: (document: Document) => void,
  onDownloadAllTranslations: (document: Document) => Promise<void>,
): ColumnDef<Document>[] {
  const columnDefinitions: ColumnDef<Document>[] = [
    {
      id: "select",
      size: 10, // Fixed width for checkbox column
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getFilteredSelectedRowModel().rows.length > 0 &&
            table.getFilteredSelectedRowModel().rows.length === table.getFilteredRowModel().rows.length
          }
          onCheckedChange={(value) => {
            table.toggleAllPageRowsSelected(!!value)
          }}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => {
            row.toggleSelected(!!value)
          }}
          aria-label="Select row"
        />
      ),
    },
    {
      accessorKey: "name",
      size: 350, // Responsive width for name column
      header: ({ column }) => (
      <SortableHeader column={column}>Name</SortableHeader>
    ),
      cell: ({ row }) => <DocumentNameCell document={row.original} />
    },
    {
      accessorKey: "type",
      size: 180, // Fixed width for type column
      header: ({ column }) => (
      <SortableHeader column={column}>Type</SortableHeader>
    ),
      cell: ({ row }) => {
        const document = row.original
        return document.type === 'original' ? 'Original' : `Translation (${document.language})`
      }
    },
    {
      accessorKey: "fileSize",
      size: 100, // Fixed width for file size column
      header: ({ column }) => (
      <SortableHeader column={column}>Size</SortableHeader>
    ),
      cell: ({ row }) => row.original.fileSize || '-'
    },
    {
      id: "lastUpdated",
      accessorFn: (row) => row.updatedAt || row.createdAt,
      size: 150, // Fixed width for date column
      header: ({ column }) => (
      <SortableHeader column={column}>Last Updated</SortableHeader>
    ),
    cell: ({ row }) => {
      const value = row.original.updatedAt;
      if (!value) return '-';
      try {
        return formatDate(value);
      } catch (e) {
        console.error('Date parsing error:', e);
        return value;
      }
    }
    },
    {
      id: "actions",
      size: 120, // Fixed width for actions column
      header: "Actions",
      cell: ({ row }) => {
        const document = row.original
        const actions: TableRowAction[] = []
        
        // Add Download action for all documents that don't have cleared files
        if (!document.wasCleared) {
          actions.push({
            label: document.hasIntegrityIssue ? "Try Download" : "Download",
            icon: DownloadIcon,
            onClick: () => onDownload(document)
          })
        }
        
        // Add Translate and Edit actions only for original documents
        if (document.type === 'original') {
          actions.push({
            label: "Translate",
            icon: LanguagesIcon,
            onClick: () => onTranslate(document)
          })
          
          // Add Download All Translations action if translations exist
          if (document.translationsCount && document.translationsCount > 0) {
            actions.push({
              label: `Download (${document.translationsCount}) Translation${document.translationsCount > 1 ? 's' : ''}`,
              icon: FileDownIcon,
              onClick: () => onDownloadAllTranslations(document)
            })
          }
          
          actions.push({
            label: "Edit",
            icon: SquarePenIcon,
            onClick: () => onEdit(document)
          })
        }
        
        // Add Delete action for all documents
        actions.push({
          label: "Delete",
          icon: Trash2Icon,
          onClick: () => onDelete(document),
          variant: "destructive",
        })
        
        return (
          <TableActionMenu
            actions={actions}
            triggerLabel="Open document actions"
            size="sm"
          />
        )
      }
    }
  ]


  return columnDefinitions
}
