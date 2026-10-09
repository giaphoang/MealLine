// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { ColumnDef } from "@tanstack/react-table"
import { LayoutTemplate } from "@/components/ui/icons";
import { PencilIcon } from "@/components/animate-ui/icons/pencil";
import { CopyIcon } from "@/components/animate-ui/icons/copy";
import { SquarePenIcon } from "@/components/animate-ui/icons/square-pen";
import { PrinterIcon } from "@/components/animate-ui/icons/printer";
import { DownloadIcon } from "@/components/animate-ui/icons/download";
import { LanguagesIcon } from "@/components/animate-ui/icons/languages";
import { Trash2Icon } from "@/components/animate-ui/icons/trash-2";
import { ClipboardListIcon } from "@/components/animate-ui/icons/clipboard-list";
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { TableActionMenu } from "@/components/ui/table-action-menu"
import { IconDisplay } from "@/components/shared/icon-display"
import { ResponsiveTruncatedText } from "@/components/ui/responsive-truncated-text"
import { SavedBuilderTemplate, SectionTableBuilderComponent } from "@/components/shopping-lists/builder/types"
import { SortableHeader } from "@/components/ui/sortable-header"
import { formatDate } from '@/lib/formatting/date'

export interface BuilderTemplateActions {
  onRename: (template: SavedBuilderTemplate) => void
  onDelete: (template: SavedBuilderTemplate) => void
  onDuplicate: (template: SavedBuilderTemplate) => void
  onEdit: (template: SavedBuilderTemplate) => void
  onPrint: (template: SavedBuilderTemplate) => void
  onDownloadPdf: (template: SavedBuilderTemplate) => void
  /**
   * Opens the Translate & Generate modal so staff can produce a PDF of the
   * template in a non-English language. Slice 1 translates text-component
   * content only; other components still render in English.
   */
  onTranslateAndDownloadPdf: (template: SavedBuilderTemplate) => void
}

const formatDate = (value: string) => {
  try {
    return formatDate(value)
  } catch {
    return value
  }
}

const getInventorySectionCount = (template: SavedBuilderTemplate) => {
  return template.templateData.components.filter((component) => (
    component.type === 'section-table' && component.inventorySource
  )).length
}

const getTemplateSectionLabels = (template: SavedBuilderTemplate) => {
  const labels = template.templateData.components
    .filter((component): component is SectionTableBuilderComponent => component.type === 'section-table')
    .map((component) => component.inventorySource?.categoryName || component.title || component.name)
    .filter((label) => label.trim().length > 0)

  return Array.from(new Set(labels))
}

export const builderTemplateColumns = ({
  onRename,
  onDelete,
  onDuplicate,
  onEdit,
  onPrint,
  onDownloadPdf,
  onTranslateAndDownloadPdf,
}: BuilderTemplateActions): ColumnDef<SavedBuilderTemplate>[] => {
  const columnDefinitions: ColumnDef<SavedBuilderTemplate>[] = [
    {
      id: "select",
      size: 10,
      enableSorting: false,
      enableHiding: false,
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
    },
    {
      accessorKey: "name",
      size: 280,
      enableHiding: false,
      header: ({ column }) => (
      <SortableHeader column={column}>Name</SortableHeader>
    ),
      cell: ({ row }) => {
        const name = row.getValue("name") as string

        return (
          <div className="flex min-w-0 items-center space-x-2">
            <IconDisplay icon={ClipboardListIcon} size="sm" className="shrink-0" />
            <ResponsiveTruncatedText
              text={name}
              title="View full name"
              className="min-w-0 flex-1 font-medium"
            />
          </div>
        )
      },
    },
    {
      id: "details",
      size: 300,
      enableHiding: true,
      header: "Details",
      cell: ({ row }) => {
        const template = row.original
        const componentCount = template.templateData.components.length
        const inventorySectionCount = getInventorySectionCount(template)
        const sectionLabels = getTemplateSectionLabels(template)
        const visibleSectionLabels = sectionLabels.slice(0, 4)
        const hiddenSectionCount = Math.max(sectionLabels.length - visibleSectionLabels.length, 0)

        return (
          <div className="space-y-2 text-sm text-muted-foreground">
            <div>
              <div className="font-medium text-foreground">
                {componentCount} {componentCount === 1 ? 'component' : 'components'}
              </div>
              <div className="text-xs">
                {inventorySectionCount} live inventory {inventorySectionCount === 1 ? 'section' : 'sections'}
              </div>
            </div>
            {sectionLabels.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {visibleSectionLabels.map((label) => (
                  <Badge
                    key={label}
                    variant="outline"
                    className="max-w-36 truncate font-normal"
                    title={label}
                  >
                    {label}
                  </Badge>
                ))}
                {hiddenSectionCount > 0 && (
                  <Badge variant="secondary" className="font-normal">
                    +{hiddenSectionCount}
                  </Badge>
                )}
              </div>
            )}
          </div>
        )
      },
    },
    {
      id: "updatedAt",
      accessorFn: (row) => row.updatedAt,
      size: 150,
      enableHiding: true,
      header: ({ column }) => (
      <SortableHeader column={column}>Last Updated</SortableHeader>
    ),
      cell: ({ row }) => formatDate(row.original.updatedAt || row.original.createdAt),
    },
    {
      id: "actions",
      size: 120,
      enableHiding: false,
      header: "Actions",
      cell: ({ row }) => {
        const template = row.original

        return (
          <TableActionMenu
            actions={[
              {
                label: "Rename",
                icon: PencilIcon,
                onClick: () => onRename(template),
              },
              {
                label: "Duplicate",
                icon: CopyIcon,
                onClick: () => onDuplicate(template),
              },
              {
                label: "Edit",
                icon: SquarePenIcon,
                onClick: () => onEdit(template),
              },
              {
                label: "Print",
                icon: PrinterIcon,
                onClick: () => onPrint(template),
              },
              {
                label: "Download PDF",
                icon: DownloadIcon,
                onClick: () => onDownloadPdf(template),
              },
              {
                label: "Translate & Download PDF",
                icon: LanguagesIcon,
                onClick: () => onTranslateAndDownloadPdf(template),
              },
              {
                label: "Delete",
                icon: Trash2Icon,
                onClick: () => onDelete(template),
                variant: "destructive",
              },
            ]}
            triggerLabel="Open saved template actions"
            size="sm"
          />
        )
      },
    },
  ]


  return columnDefinitions
}
