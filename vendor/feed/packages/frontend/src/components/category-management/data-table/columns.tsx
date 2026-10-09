// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { ColumnDef } from "@tanstack/react-table"
import { PersonStanding, Home } from "@/components/ui/icons";
import { SquarePenIcon } from "@/components/animate-ui/icons/square-pen";
import { Trash2Icon } from "@/components/animate-ui/icons/trash-2";
import { IconDisplay } from "../icon-display"
import { TableActionMenu } from "@/components/ui/table-action-menu"
import { Category } from "@/types/category"
import { Checkbox } from "@/components/ui/checkbox"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ResponsiveTruncatedText } from "@/components/ui/responsive-truncated-text"
import { SortableHeader } from "@/components/ui/sortable-header"
import { formatDate } from '@/lib/formatting/date'

export interface CategoryActions {
  onEdit: (category: Category) => void
  onDelete: (category: Category) => void
}

export const columns = ({ onEdit, onDelete }: CategoryActions): ColumnDef<Category>[] => {
  const columnDefinitions: ColumnDef<Category>[] = [
  {
    id: "select",
    size: 10, // Fixed width for checkbox column
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
    size: 300, // Responsive width for name column
    header: ({ column }) => (
      <SortableHeader column={column}>Name</SortableHeader>
    ),
    cell: ({ row }) => {
      const name = row.getValue("name") as string;
      const icon = row.original.icon;
      
      return (
        <div className="flex items-center space-x-2 min-w-0">
          <IconDisplay iconName={icon} size="sm" showTooltip={false} className="shrink-0" />
          <ResponsiveTruncatedText 
            text={name} 
            title="View full category name"
            className="flex-1 min-w-0"
          />
        </div>
      );
    }
  },
  {
    accessorKey: "limit",
    size: 120, // Fixed width for limit column
    header: ({ column }) => (
      <SortableHeader column={column}>Limit</SortableHeader>
    ),
    cell: ({ row }) => {
      const limit = row.getValue("limit") as number
      const limitType = row.original.limitType
      
      if (limit === 100) return "No Limit"
      
      return (
        <div className="flex items-center gap-1">
          <span>{limit.toString()}</span>
          <Tooltip>
            <TooltipTrigger>
              {limitType === 'person' ? (
                <PersonStanding className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Home className="h-4 w-4 text-muted-foreground" />
              )}
            </TooltipTrigger>
            <TooltipContent>
              <p>{limitType === 'person' ? 'Per Person' : 'Per Household'}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      )
    },
  },
  {
    id: "lastUpdated",
    accessorFn: (row) => row.updatedAt,
    size: 150, // Fixed width for date column
    enableHiding: true,
    header: ({ column }) => (
      <SortableHeader column={column}>Last Updated</SortableHeader>
    ),
    cell: ({ row }) => {
      return formatDate(row.getValue("lastUpdated") as string)
    }
  },
  {
    id: "actions",
    size: 100, // Fixed width for actions column
    enableHiding: false,
    header: "Actions",
    cell: ({ row }) => {
      const category = row.original

      return (
        <TableActionMenu
          actions={[
            {
              label: "Edit",
              icon: SquarePenIcon,
              onClick: () => onEdit(category)
            },
            {
              label: "Delete",
              icon: Trash2Icon,
              onClick: () => onDelete(category),
              variant: "destructive"
            }
          ]}
          triggerLabel="Open category actions"
          size="sm"
        />
      )
    },
  },
  ]


  return columnDefinitions
}
