// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { ColumnDef } from "@tanstack/react-table"
import { Settings } from "@/components/ui/icons";
import { SquarePenIcon } from "@/components/animate-ui/icons/square-pen";
import { Trash2Icon } from "@/components/animate-ui/icons/trash-2";
import { ToggleLeftIcon } from "@/components/animate-ui/icons/toggle-left";
import { ToggleRightIcon } from "@/components/animate-ui/icons/toggle-right";
import { TableActionMenu } from "@/components/ui/table-action-menu"
import { AIConfiguration, CatalogueModel } from "../types"
import { lifecycleNotice, costNotice } from "../model-notices"
import { UnifiedConfiguration } from "@/services/unified-config"
import { Checkbox } from "@/components/ui/checkbox"
import { StatusBadge } from "@/components/shared/status-badge"
import { SortableHeader } from "@/components/ui/sortable-header"
import { formatDate } from '@/lib/formatting/date'

export interface AIConfigurationActions {
  onEdit: (config: UnifiedConfiguration) => void
  onDelete: (config: UnifiedConfiguration) => void
  onToggleActive: (config: UnifiedConfiguration) => void
  /**
   * Looks a saved configuration's model up in the catalogue, offered or
   * withdrawn. Passed in because this is a plain function and cannot call a
   * hook; optional so the table renders unchanged before the catalogue
   * arrives, or if the request fails.
   */
  findModel?: (id?: string | null) => CatalogueModel | undefined
}

export const columns = ({ onEdit, onDelete, onToggleActive, findModel }: AIConfigurationActions): ColumnDef<UnifiedConfiguration>[] => {
  const columnDefinitions: ColumnDef<UnifiedConfiguration>[] = [
  {
    id: "select",
    size: 10,
    enableSorting: false,
    enableHiding: true,
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
    size: 200,
    header: ({ column }) => (
      <SortableHeader column={column}>Configuration Name</SortableHeader>
    ),
    cell: ({ row }) => {
      const name = row.getValue("name") as string;
      return (
        <div className="font-medium">
          {name}
        </div>
      );
    }
  },
  {
    accessorKey: "type",
    size: 140,
    enableHiding: true,
    header: ({ column }) => (
      <SortableHeader column={column}>Type</SortableHeader>
    ),
    cell: ({ row }) => {
      const type = row.getValue("type") as string
      let displayType = type
      if (type === 'prompt') displayType = 'System Prompt'
      if (type === 'apikey') displayType = 'API Key'
      return displayType
    }
  },
  {
    accessorKey: "description",
    size: 300,
    header: ({ column }) => (
      <SortableHeader column={column}>Description</SortableHeader>
    ),
    cell: ({ row }) => {
      const config = row.original;
      const description = config.description;
      const type = config.type;
      
      // Show user description if available
      if (description && description.trim()) {
        return (
          <div className="text-sm">
            {description}
          </div>
        );
      }
      
      // Fallback to technical details when description is missing
      if (type === 'apikey') {
        const notice = lifecycleNotice(findModel?.(config.model));
        // Only the lifecycle line here; the cost warning is a badge, and
        // repeating it in the description would crowd the row.
        return (
          <div className="text-sm text-muted-foreground">
            <div className="font-medium">{config.serviceType} - {config.modelName}</div>
            {notice && (
              <div className="text-xs text-destructive">{notice.detail}</div>
            )}
            <div className="font-mono text-xs">••••••••••••••••</div>
          </div>
        );
      }
      
      if (type === 'prompt') {
        return (
          <div className="text-sm text-muted-foreground">
            <div className="font-medium">{config.promptCategory}</div>
            {config.serviceDescription && (
              <div className="text-xs">
                {config.serviceDescription.length > 50 
                  ? config.serviceDescription.substring(0, 50) + "..." 
                  : config.serviceDescription}
              </div>
            )}
          </div>
        );
      }
      
      return (
        <div className="text-sm text-muted-foreground">
          Not configured
        </div>
      );
    },
  },
  {
    accessorKey: "isActive",
    size: 120,
    enableHiding: true,
    header: ({ column }) => (
      <SortableHeader column={column}>Status</SortableHeader>
    ),
    cell: ({ row }) => {
      const isActive = row.getValue("isActive") as boolean
      const config = row.original
      const model = config.type === 'apikey' ? findModel?.(config.model) : undefined
      const notice = lifecycleNotice(model)
      const cost = costNotice(model)

      return (
        <div className="flex flex-wrap items-center gap-1">
          <StatusBadge
            label={isActive ? 'Active' : 'Inactive'}
            status={isActive ? 'success' : 'neutral'}
          />
          {notice && (
            <StatusBadge label={notice.label} status={notice.tone} title={notice.detail} />
          )}
          {cost && (
            <StatusBadge label={cost.label} status={cost.tone} title={cost.detail} />
          )}
        </div>
      )
    }
  },
  {
    accessorKey: "updatedAt",
    size: 140,
    enableHiding: true,
    header: ({ column }) => (
      <SortableHeader column={column}>Last Updated</SortableHeader>
    ),
    cell: ({ row }) => {
      const updatedAt = row.getValue("updatedAt") as string
      return formatDate(updatedAt)
    }
  },
  {
    id: "actions",
    size: 120,
    enableHiding: false,
    header: "Actions",
    cell: ({ row }) => {
      const config = row.original

      return (
        <TableActionMenu
          actions={[
            {
              label: "Edit",
              icon: SquarePenIcon,
              onClick: () => onEdit(config)
            },
            {
              label: config.isActive ? "Deactivate" : "Activate",
              icon: config.isActive ? ToggleRightIcon : ToggleLeftIcon,
              onClick: () => onToggleActive(config),
              title: config.isActive ?
                "Deactivate this configuration" :
                "Activate this configuration"
            },
            {
              label: "Delete",
              icon: Trash2Icon,
              onClick: () => onDelete(config),
              variant: "destructive"
            }
          ]}
          triggerLabel="Open configuration actions"
          size="sm"
        />
      )
    },
  },
  ]


  return columnDefinitions
}
