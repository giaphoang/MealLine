// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { AIConfiguration, AIConfigurationType, ThinkingLevelValue } from "./types"
import { useDialogState } from "@/hooks/dialog/useDialogState"
import { AIConfigurationList } from "./AIConfigurationList"
import { AddAIModelDialog } from "./AddAIModelDialog"
import { AddSystemPromptDialog } from "./AddSystemPromptDialog"
import { EditAIModelDialog } from "./EditAIModelDialog"
import { EditSystemPromptDialog } from "./EditSystemPromptDialog"

import { DeleteDialog } from "./delete-dialog"
import { BulkDeleteDialog } from "./bulk-delete-dialog"
import { InitialSetupWizard } from "./setup/InitialSetupWizard"
import { useMessage } from "@/hooks/message/useMessage"
import { ErrorHandlerService } from "@/services/error/ErrorHandlerService"
import { useSystemStatus } from "./hooks/useSystemStatus"
import { useState, useEffect, useRef } from "react"
import { AIConfigService } from "@/services/ai-config"
import { UnifiedConfigService, UnifiedConfiguration, parseCompositeId } from "@/services/unified-config"
import { SystemPrompt } from '@/types/system-prompt'
import { SystemPromptService } from '@/services/system-prompt'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AnimateIcon } from "@/components/animate-ui/icons/icon";
import { BotIcon } from "@/components/animate-ui/icons/bot";
import { MessageSquareQuoteIcon } from "@/components/animate-ui/icons/message-square-quote";
import { CpuIcon, type CpuIconHandle } from "@/components/ui/cpu";

// Initialize services
const aiConfigService = new AIConfigService();
const unifiedConfigService = new UnifiedConfigService();
const systemPromptService = new SystemPromptService();

export function AIConfiguration() {
  const { showMessage } = useMessage();
  const { status: systemStatus, isLoading: statusLoading, checkStatus, clearCache } = useSystemStatus();
  const [configurations, setConfigurations] = useState<UnifiedConfiguration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [systemPromptData, setSystemPromptData] = useState<SystemPrompt | null>(null);
  // CpuIcon is an imperative-ref (lucide-animated) icon: attaching a ref puts
  // it in controlled mode so the parent Card's hover drives it, matching the
  // native animate-ui Prompt card (ISSUES.md #35).
  const aiModelIconRef = useRef<CpuIconHandle>(null);

  // Dialog state
  const editAIModelDialog = useDialogState<UnifiedConfiguration>();
  const editSystemPromptDialog = useDialogState<UnifiedConfiguration>();
  const deleteDialog = useDialogState<UnifiedConfiguration>();
  const bulkDeleteDialog = useDialogState<UnifiedConfiguration[]>();
  const typeSelectionDialog = useDialogState();
  const apiModelDialog = useDialogState();
  const systemPromptDialog = useDialogState();
  const setupDialog = useDialogState();

  // Check for system initialization error from backend response
  const isSystemUninitialized = (error: any): boolean => {
    return error?.message === 'ENCRYPTION_MASTER_KEY environment variable is required' ||
           error?.message === 'SYSTEM_UNINITIALIZED' ||
           error?.code === 'SYSTEM_UNINITIALIZED'
  };

  // Load configurations from API
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const configs = await unifiedConfigService.getUnifiedConfigurations();
        setConfigurations(configs);
      } catch (error) {
        ErrorHandlerService.handleError(error, 'loadConfigurations');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [showMessage]);

  // Edit handlers
  const handleEdit = async (config: UnifiedConfiguration) => {
    if (config.type === 'apikey') {
      editAIModelDialog.open(config);
    } else if (config.type === 'prompt') {
      // Load SystemPrompt data for prompt configurations
      try {
        const prompts = await systemPromptService.getSystemPrompts();
        const matchingPrompt = prompts.find(p => p.name === config.name);
        setSystemPromptData(matchingPrompt || null);
        editSystemPromptDialog.open(config);
      } catch (error) {
        ErrorHandlerService.handleError(error, 'loadSystemPromptData');
      }
    }
  };

  const handleSaveAIModelEdit = async (updatedConfig: Partial<AIConfiguration>): Promise<boolean> => {
    if (!editAIModelDialog.data) return false;

    try {
      setIsSaving(true);
      // Extract original ID for backend API call
      const { originalId } = parseCompositeId(editAIModelDialog.data.id);
      const updated = await aiConfigService.updateConfiguration({
        id: originalId,
        name: editAIModelDialog.data.name,
        type: editAIModelDialog.data.type as 'apikey',
        value: '', // Not used for API key configs
        description: editAIModelDialog.data.description,
        isActive: editAIModelDialog.data.isActive,
        createdAt: editAIModelDialog.data.createdAt,
        updatedAt: editAIModelDialog.data.updatedAt,
        ...updatedConfig
      } as any);
      
      setConfigurations(prev => 
        prev.map(config => 
          config.id === editAIModelDialog.data!.id ? { 
            ...config, 
            name: updated.name,
            description: updated.description,
            isActive: updated.isActive,
            updatedAt: updated.updatedAt,
            // Update other fields that may have changed
            modelName: updated.modelName,
            model: updated.model,
            serviceType: updated.serviceType,
            endpointUrl: updated.endpointUrl,
            inputCost: updated.inputCost,
            outputCost: updated.outputCost,
            temperature: updated.temperature,
            thinkingLevel: updated.thinkingLevel,
            inputTokenLimit: updated.inputTokenLimit,
            outputTokenLimit: updated.outputTokenLimit ?? updated.maxTokens,
            dailyCostLimit: updated.dailyCostLimit,
            monthlyCostLimit: updated.monthlyCostLimit,
            tokensPerMinute: updated.tokensPerMinute,
            requestsPerMinute: updated.requestsPerMinute,
            requestsPerDay: updated.requestsPerDay
          } : config
        )
      );
      
      editAIModelDialog.close();
      showMessage("Configuration updated successfully", "success");
      return true;
    } catch (err) {
      ErrorHandlerService.handleError(err, 'saveAIModelEdit');
      return false;
    } finally {
      setIsSaving(false);
    }
  };



  // Delete handlers
  const handleDelete = (config: UnifiedConfiguration) => {
    deleteDialog.open(config);
  };

  const handleConfirmDelete = async (config: UnifiedConfiguration) => {
    try {
      setIsSaving(true);
      await unifiedConfigService.deleteConfiguration(config);
      
      setConfigurations(prev => prev.filter(c => c.id !== config.id));
      deleteDialog.close();
      showMessage("Configuration deleted successfully", "success");
    } catch (err) {
      ErrorHandlerService.handleError(err, 'confirmDelete');
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle active handlers
  const handleToggleActive = async (config: UnifiedConfiguration) => {
    try {
      setIsSaving(true);
      const updated = await unifiedConfigService.toggleActive(config);
      
      setConfigurations(prev => 
        prev.map(c => 
          c.id === config.id ? updated : c
        )
      );
      
      showMessage(`Configuration ${config.isActive ? 'deactivated' : 'activated'}`, "success");
    } catch (err) {
      ErrorHandlerService.handleError(err, 'toggleActive');
    } finally {
      setIsSaving(false);
    }
  };

  // Bulk operations
  const handleBulkDelete = async (configurationsToDelete: UnifiedConfiguration[]) => {
    bulkDeleteDialog.open(configurationsToDelete);
    return {
      success: 0,
      failed: 0,
      errors: []
    };
  };

  const handleConfirmBulkDelete = async (configurationsToDelete: UnifiedConfiguration[]) => {
    try {
      setIsSaving(true);
      const result = await unifiedConfigService.bulkDeleteConfigurations(configurationsToDelete);
      
      // Remove successfully deleted configurations
      if (result.success > 0) {
        const deletedIds = configurationsToDelete.map(c => c.id);
        setConfigurations(prev => prev.filter(c => !deletedIds.includes(c.id)));
      }
      
      bulkDeleteDialog.close();
      showMessage(`Successfully deleted ${result.success} ${result.success === 1 ? 'configuration' : 'configurations'}`, "success");
    } catch (err) {
      ErrorHandlerService.handleError(err, 'confirmBulkDelete');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBulkToggleActive = async (configurationsToToggle: UnifiedConfiguration[]) => {
    try {
      setIsSaving(true);
      const result = await unifiedConfigService.bulkToggleActive(configurationsToToggle);
      
      if (result.success > 0) {
        // Reload configurations to get updated state
        const configs = await unifiedConfigService.getUnifiedConfigurations();
        setConfigurations(configs);
      }
      
      return result;
    } catch (err) {
      ErrorHandlerService.handleError(err, 'bulkToggleActive');
      return {
        success: 0,
        failed: configurationsToToggle.length,
        errors: [err instanceof Error ? err.message : 'Unknown error']
      };
    } finally {
      setIsSaving(false);
    }
  };

  // Add new configuration handler
  const handleAddConfiguration = async () => {
    // Proactive system status check
    if (!statusLoading && systemStatus && !systemStatus.initialized) {
      setupDialog.open();
      return;
    }
    
    // If status is still loading, wait for it
    if (statusLoading || !systemStatus) {
      await checkStatus();
      // Re-check after status load
      if (systemStatus && !systemStatus.initialized) {
        setupDialog.open();
        return;
      }
    }
    
    typeSelectionDialog.open();
  };

  // Type selection handler
  const handleTypeSelect = (type: AIConfigurationType) => {
    typeSelectionDialog.close();
    if (type === 'prompt') {
      systemPromptDialog.open();
    } else {
      apiModelDialog.open();
    }
  };

  const handleCreateConfiguration = async (data: {
    name: string;
    type: AIConfigurationType;
    value: string;
    description?: string;
    modelName?: string;
    model?: string;
    serviceType?: 'OpenAI' | 'Anthropic' | 'Google' | 'Azure';
    endpointUrl?: string;
    apiKey?: string;
    inputCost?: number;
    outputCost?: number;
    temperature?: number;
    topP?: number;
    thinkingLevel?: ThinkingLevelValue | null;
    inputTokenLimit?: number;
    outputTokenLimit?: number;
    tokensPerMinute?: number;
    requestsPerMinute?: number;
    requestsPerDay?: number;
    unitPrice?: 'per_1k' | 'per_1m';
  }) => {
    try {
      setIsSaving(true);
      await aiConfigService.createConfiguration(data);
      
      // Reload configurations to get updated list with proper composite IDs
      const configs = await unifiedConfigService.getUnifiedConfigurations();
      setConfigurations(configs);
      
      showMessage("Configuration created successfully", "success");
      return true;
    } catch (err) {
      // Secondary fallback: Check for system initialization errors
      if (err instanceof Error && isSystemUninitialized(err)) {
        // Refresh status and route to setup as fallback
        await checkStatus();
        apiModelDialog.setOpen(false);
        setupDialog.open();
        return false;
      }
      
      ErrorHandlerService.handleError(err, 'createConfiguration');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // Handle system prompt save (with refresh callback)
  const handleSystemPromptSave = async (): Promise<boolean> => {
    // Reload configurations after prompt creation
    try {
      const configs = await unifiedConfigService.getUnifiedConfigurations();
      setConfigurations(configs);
      return true;
    } catch (error) {
      ErrorHandlerService.handleError(error, 'systemPromptSave');
      return false;
    }
  };

  // Handle system prompt edit save
  const handleSystemPromptEditSave = async () => {
    // Reload configurations after prompt edit
    try {
      const configs = await unifiedConfigService.getUnifiedConfigurations();
      setConfigurations(configs);
      editSystemPromptDialog.close();
    } catch (error) {
      ErrorHandlerService.handleError(error, 'systemPromptEditSave');
    }
  };

  // Setup completion handler
  const handleSetupComplete = async () => {
    clearCache();
    await checkStatus();
    typeSelectionDialog.open();
  };

  // Reset to defaults handler
  const handleResetDefaults = () => {
    showMessage('Reset to defaults functionality coming soon', 'info');
  };

  return (
    <div className="space-y-8">
      <AIConfigurationList
        configurations={configurations}
        isLoading={isLoading}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onToggleActive={handleToggleActive}
        bulkDelete={handleBulkDelete}
        bulkToggleActive={handleBulkToggleActive}
        onAddConfiguration={handleAddConfiguration}
        onResetDefaults={handleResetDefaults}
      />

      <Dialog open={typeSelectionDialog.isOpen} onOpenChange={typeSelectionDialog.setOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Add AI Configuration</DialogTitle>
            <DialogDescription>Select the type of AI configuration to create</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="text-center">
              {/* Configuration Type header icon — animates on dialog reveal
                  + on direct hover. Uses the native animate-ui Bot variant. */}
              <AnimateIcon animateOnView animateOnViewOnce animateOnHover className="inline-block">
                <BotIcon className="h-12 w-12 mx-auto text-muted-foreground" size={48} />
              </AnimateIcon>
              <h3 className="mt-2 text-lg font-medium">Configuration Type</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Choose the type of AI configuration you want to create
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {/* AI Model card — Cpu is imperative-ref (lucide-animated), so
                  the native AnimateIcon context cannot drive it. Instead we
                  attach a ref (which flips the icon into controlled mode,
                  disabling its own direct-hover trigger) and start/stop its
                  animation from the Card's hover, so hovering anywhere on the
                  card animates the icon — matching the native Prompt card
                  below (ISSUES.md #35). */}
              <Card
                className="cursor-pointer transition-all hover:border-primary"
                onClick={() => handleTypeSelect('apikey')}
                onMouseEnter={() => aiModelIconRef.current?.startAnimation()}
                onMouseLeave={() => aiModelIconRef.current?.stopAnimation()}
              >
                <CardHeader className="text-center pb-2">
                  <CpuIcon ref={aiModelIconRef} className="h-8 w-8 mx-auto text-primary" size={32} />
                  <CardTitle className="text-base">AI Model</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <CardDescription className="text-center">
                    Configure API key, model settings, costs, and usage limits for AI services
                  </CardDescription>
                </CardContent>
              </Card>

              {/* Prompt card — MessageSquareQuote is native animate-ui;
                  wrapping the Card with <AnimateIcon asChild> attaches
                  hover/view handlers to the Card itself so card-hover and
                  dialog-reveal both fire the icon's wobble. */}
              <AnimateIcon asChild animateOnView animateOnViewOnce animateOnHover animateOnTap>
                <Card
                  className="cursor-pointer transition-all hover:border-primary"
                  onClick={() => handleTypeSelect('prompt')}
                >
                  <CardHeader className="text-center pb-2">
                    <MessageSquareQuoteIcon className="h-8 w-8 mx-auto text-primary" size={32} />
                    <CardTitle className="text-base">Prompt</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <CardDescription className="text-center">
                      Create a system prompt for AI operations like translation or text categorization
                    </CardDescription>
                  </CardContent>
                </Card>
              </AnimateIcon>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => typeSelectionDialog.close()}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AddAIModelDialog
        open={apiModelDialog.isOpen}
        onOpenChange={apiModelDialog.setOpen}
        onSave={handleCreateConfiguration}
        isLoading={isSaving}
      />

      <AddSystemPromptDialog
        open={systemPromptDialog.isOpen}
        onOpenChange={systemPromptDialog.setOpen}
        onSave={handleSystemPromptSave}
        isLoading={isSaving}
      />

      <EditAIModelDialog
        open={editAIModelDialog.isOpen}
        configuration={editAIModelDialog.data}
        onOpenChange={editAIModelDialog.setOpen}
        onSave={handleSaveAIModelEdit}
        isLoading={isSaving}
      />

      <EditSystemPromptDialog
        open={editSystemPromptDialog.isOpen}
        configuration={editSystemPromptDialog.data}
        systemPromptData={systemPromptData}
        onOpenChange={editSystemPromptDialog.setOpen}
        onSave={handleSystemPromptEditSave}
        isLoading={isSaving}
      />

      <DeleteDialog
        configuration={deleteDialog.data}
        open={deleteDialog.isOpen}
        onOpenChange={deleteDialog.setOpen}
        onConfirm={handleConfirmDelete}
        isLoading={isSaving}
      />

      <BulkDeleteDialog
        configurations={bulkDeleteDialog.data || []}
        open={bulkDeleteDialog.isOpen}
        onOpenChange={bulkDeleteDialog.setOpen}
        onConfirm={handleConfirmBulkDelete}
        isLoading={isSaving}
      />

      <InitialSetupWizard
        open={setupDialog.isOpen}
        onOpenChange={setupDialog.setOpen}
        onComplete={handleSetupComplete}
      />
    </div>
  );
}
