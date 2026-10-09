// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useCallback, useState, useRef, useMemo } from "react"
import * as React from "react"
import { AIConfiguration, BulkOperationResult, AIConfigurationType } from "../types"
import { UnifiedConfiguration } from "@/services/unified-config"
import { columns } from "../data-table/columns"
import { DataList } from "@/components/shared/data-list/DataList"
import type { TypeFilterOption } from "@/components/ui/type-filter"
import { TooltipProvider } from "@/components/ui/tooltip"
import { TableBulkAction } from "@/types/table"
import { useMessage } from "@/hooks/message/useMessage"
import { useModelCatalogue } from "@/hooks/ai-config/useModelCatalogue"
import { Trash2, ToggleLeft, ToggleRight, Bot } from "@/components/ui/icons";
import { PlusIcon } from "@/components/animate-ui/icons/plus";
import { SettingsIcon } from "@/components/animate-ui/icons/settings";
import { BotIcon, type BotIconHandle } from "@/components/ui/bot";

/**
 * Page-title Bot — uses the lucide-animated imperative-ref variant. Fires
 * its animation once on mount (page load) and again on direct hover. Wrapped
 * here rather than enhancing SectionHeader so the page-load behavior is
 * scoped to this header.
 */
function PageTitleBotIcon({ className, size }: { className?: string; size?: number }) {
  const iconRef = React.useRef<BotIconHandle>(null);
  React.useEffect(() => {
    iconRef.current?.startAnimation();
  }, []);
  return (
    <BotIcon
      ref={iconRef}
      className={className}
      size={size}
      onMouseEnter={() => iconRef.current?.startAnimation()}
      onMouseLeave={() => iconRef.current?.stopAnimation()}
    />
  );
}

interface AIConfigurationListProps {
  configurations: UnifiedConfiguration[]
  isLoading: boolean
  onEdit: (config: UnifiedConfiguration) => void
  onDelete: (config: UnifiedConfiguration) => void
  onToggleActive: (config: UnifiedConfiguration) => void
  bulkDelete: (configurations: UnifiedConfiguration[]) => Promise<BulkOperationResult>
  bulkToggleActive: (configurations: UnifiedConfiguration[]) => Promise<BulkOperationResult>
  onAddConfiguration?: () => void
  onResetDefaults?: () => void
}

const AI_CONFIGURATION_TYPES: AIConfigurationType[] = ['prompt', 'apikey']

/**
 * What the Types filter offers on this page. The shared filter used to supply
 * its own list, which was Translation Management's — so this page showed
 * "Category / Food Item / Custom / Generated (Document)" above rows that are
 * only ever API keys and system prompts, with every box unchecked and no
 * combination of clicks able to filter anything.
 */
const AI_CONFIGURATION_TYPE_OPTIONS: readonly TypeFilterOption<AIConfigurationType>[] = [
  { value: 'apikey', label: 'API Key' },
  { value: 'prompt', label: 'System Prompt' }
]

export function AIConfigurationList({
  configurations,
  isLoading,
  onEdit,
  onDelete,
  onToggleActive,
  bulkDelete,
  bulkToggleActive,
  onAddConfiguration,
  onResetDefaults,
}: AIConfigurationListProps) {
  const { showSuccess, showError } = useMessage()
  // The catalogue lives here rather than in `columns`, which is a plain
  // function and cannot call a hook. Until it arrives `findModel` returns
  // undefined and the table renders exactly as before.
  const { findModel } = useModelCatalogue()
  const [selectedForBulkDelete, setSelectedForBulkDelete] = useState<UnifiedConfiguration[]>([])
  const [selectedTypes, setSelectedTypes] = useState<AIConfigurationType[]>(AI_CONFIGURATION_TYPES)
  const dataListRef = useRef<{ clearSelection: () => void } | null>(null)
  
  const filteredConfigurations = useMemo(() => {
    if (!configurations || !Array.isArray(configurations)) return [];
    
    return configurations.filter(config => {
      if (!config) return false;
      
      const typeMatch = selectedTypes.includes(config.type);
      
      return typeMatch;
    });
  }, [configurations, selectedTypes]);

  const handleBulkDelete = useCallback(async (selected: UnifiedConfiguration[]) => {
    try {
      const result = await bulkDelete(selected);

      if (dataListRef.current?.clearSelection) {
        dataListRef.current.clearSelection();
      }

      if (result && typeof result === 'object') {
        if (result.errors?.length > 0) {
          showError(result.errors[0], {
            duration: 8000
          });
        } else {
          showSuccess(`Successfully deleted ${result.success} ${result.success === 1 ? 'configuration' : 'configurations'}`);
        }
      }
    } catch (error) {
      console.error('AIConfigurationList: Bulk delete error:', error);
      if (error instanceof Error) {
        showError(`Bulk delete operation failed: ${error.message}`, {
          duration: 8000
        });
      }
    }
  }, [bulkDelete, showSuccess, showError])

  const handleBulkToggleActive = useCallback(async (selected: UnifiedConfiguration[]) => {
    try {
      const result = await bulkToggleActive(selected);

      if (dataListRef.current?.clearSelection) {
        dataListRef.current.clearSelection();
      }

      if (result && typeof result === 'object') {
        if (result.errors?.length > 0) {
          showError(result.errors[0], {
            duration: 8000
          });
        } else {
          showSuccess(`Successfully updated ${result.success} ${result.success === 1 ? 'configuration' : 'configurations'}`);
        }
      }
    } catch (error) {
      console.error('AIConfigurationList: Bulk toggle active error:', error);
      if (error instanceof Error) {
        showError(`Bulk toggle operation failed: ${error.message}`, {
          duration: 8000
        });
      }
    }
  }, [bulkToggleActive, showSuccess, showError])

  const handleTypeChange = useCallback((types: AIConfigurationType[]) => {
    setSelectedTypes(types);
    if (dataListRef.current?.clearSelection) {
      dataListRef.current.clearSelection();
    }
  }, []);

  const handleError = useCallback((error: Error) => {
    showError(error.message, {
      duration: 8000
    });
  }, [showError])

  const handleDataListRef = useCallback((dataList: { clearSelection: () => void } | null) => {
    dataListRef.current = dataList;
  }, []);

  const toolbarActions = [
    {
      label: 'Add Configuration',
      icon: PlusIcon,
      variant: 'default' as const,
      action: () => onAddConfiguration?.()
    },
    {
      label: 'Reset to Defaults',
      icon: SettingsIcon,
      variant: 'outline' as const,
      action: () => onResetDefaults?.()
    }
  ]

  const bulkActions: TableBulkAction<UnifiedConfiguration>[] = [
    {
      label: 'Toggle Active Status',
      icon: ToggleRight,
      action: handleBulkToggleActive,
      variant: 'default'
    },
    {
      label: 'Delete Selected',
      icon: Trash2,
      action: handleBulkDelete,
      variant: 'destructive'
    }
  ]

  return (
    <TooltipProvider>
      <DataList
        ref={handleDataListRef}
        title="AI Configuration"
        description="Manage AI system prompts, model selection, and API settings."
        items={filteredConfigurations}
        columns={columns({ onEdit, onDelete, onToggleActive, findModel })}
        isLoading={isLoading}
        bulkActions={bulkActions}
        filterColumn="name"
        filterPlaceholder="Filter configurations..."
        enableColumnVisibility={true}
        enableTypeFilter={true}
        selectedTypes={selectedTypes}
        typeOptions={AI_CONFIGURATION_TYPE_OPTIONS}
        onTypeChange={handleTypeChange}
        onError={handleError}
        toolbarActions={toolbarActions}
        toolbarIcon={PageTitleBotIcon}
      />
    </TooltipProvider>
  )
}
