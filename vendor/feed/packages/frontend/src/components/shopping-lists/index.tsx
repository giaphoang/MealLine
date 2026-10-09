// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ErrorBoundary } from 'react-error-boundary'
import { useMessage } from '@/hooks/message/useMessage'
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService'
import { shoppingListBuilderService } from '@/services/shopping-list-builder'
import { ShoppingListList } from './ShoppingListList'
import { SavedBuilderTemplate } from './builder/types'
import { TranslateAndGenerateDialog } from './dialogs/translate-and-generate-dialog'
import { ExportSettingsDialog } from './dialogs/export-settings-dialog'
import {
  DEFAULT_EXPORT_SETTINGS,
  ExportSettings,
  buildExportFilename,
} from './builder/export-filename'
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const MAX_SAVED_TEMPLATE_NAME_LENGTH = 48;
const limitBuilderTemplateName = (name: string) => name.slice(0, MAX_SAVED_TEMPLATE_NAME_LENGTH);

const downloadPdfBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

function ErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  return (
    <div role="alert" className="p-4 bg-red-50 text-red-900 rounded-md">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <pre className="mt-2 text-sm">{error.message}</pre>
      <button
        onClick={resetErrorBoundary}
        className="mt-4 px-4 py-2 bg-red-100 hover:bg-red-200 rounded-md transition-colors"
      >
        Try again
      </button>
    </div>
  )
}

export function ShoppingLists() {
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => {
        window.location.reload()
      }}
    >
      <ShoppingListsContent />
    </ErrorBoundary>
  )
}

/**
 * Shopping Lists page (v1.0.0): manage saved builder templates.
 *
 * The wizard-based "Create New List" / instance-generation flow that lived
 * here through the prototype phases was removed for v1.0.0; all template
 * creation and editing now flows through /shopping-lists/builder. This page
 * provides the list view + bulk and per-row actions on saved builder
 * templates (rename, duplicate, edit-in-builder, print, download, translate
 * & download, bulk download / duplicate / delete).
 */
function ShoppingListsContent() {
  const navigate = useNavigate();
  const { showMessage } = useMessage();

  const [isSaving, setIsSaving] = useState(false);
  const [builderTemplates, setBuilderTemplates] = useState<SavedBuilderTemplate[]>([]);
  const [isLoadingBuilderTemplates, setIsLoadingBuilderTemplates] = useState(false);
  const [renameBuilderTemplate, setRenameBuilderTemplate] = useState<SavedBuilderTemplate | null>(null);
  const [renameBuilderTemplateName, setRenameBuilderTemplateName] = useState('');
  const [isRenameBuilderTemplateDialogOpen, setIsRenameBuilderTemplateDialogOpen] = useState(false);
  const [deleteBuilderTemplate, setDeleteBuilderTemplate] = useState<SavedBuilderTemplate | null>(null);
  const [bulkDeleteBuilderTemplates, setBulkDeleteBuilderTemplates] = useState<SavedBuilderTemplate[]>([]);
  const [exportSettings, setExportSettings] = useState<ExportSettings>(DEFAULT_EXPORT_SETTINGS);
  const [isExportSettingsDialogOpen, setIsExportSettingsDialogOpen] = useState(false);

  const loadExportSettings = useCallback(async () => {
    try {
      const settings = await shoppingListBuilderService.getExportSettings();
      setExportSettings(settings);
    } catch (error) {
      ErrorHandlerService.handleError(error, 'shoppingListBuilderLoadExportSettings');
    }
  }, []);

  const loadBuilderTemplates = useCallback(async () => {
    try {
      setIsLoadingBuilderTemplates(true);
      const templates = await shoppingListBuilderService.getSavedTemplates();
      setBuilderTemplates(templates);
    } catch (error) {
      ErrorHandlerService.handleError(error, 'shoppingListBuilderLoadSavedTemplates');
    } finally {
      setIsLoadingBuilderTemplates(false);
    }
  }, []);

  useEffect(() => {
    void loadBuilderTemplates();
    void loadExportSettings();
  }, [loadBuilderTemplates, loadExportSettings]);

  const handleRenameBuilderTemplate = (template: SavedBuilderTemplate) => {
    setRenameBuilderTemplate(template);
    setRenameBuilderTemplateName(limitBuilderTemplateName(template.name));
    setIsRenameBuilderTemplateDialogOpen(true);
  };

  const closeRenameBuilderTemplateDialog = () => {
    setIsRenameBuilderTemplateDialogOpen(false);
    setRenameBuilderTemplate(null);
    setRenameBuilderTemplateName('');
  };

  const handleConfirmRenameBuilderTemplate = async () => {
    if (!renameBuilderTemplate) return;

    try {
      setIsSaving(true);
      const templateName = limitBuilderTemplateName(renameBuilderTemplateName.trim());
      const renamedTemplate = await shoppingListBuilderService.updateSavedTemplate(
        renameBuilderTemplate.id,
        templateName,
        {
          ...renameBuilderTemplate.templateData,
          name: templateName,
        },
      );

      setBuilderTemplates((current) =>
        current.map((template) => template.id === renamedTemplate.id ? renamedTemplate : template)
      );
      closeRenameBuilderTemplateDialog();
      showMessage('Template renamed successfully', 'success');
    } catch (error) {
      ErrorHandlerService.handleError(error, 'shoppingListBuilderRenameTemplate');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDuplicateBuilderTemplate = async (template: SavedBuilderTemplate) => {
    try {
      setIsSaving(true);
      const copyName = limitBuilderTemplateName(`${template.name} (Copy)`);
      const duplicatedTemplate = await shoppingListBuilderService.createSavedTemplate(
        copyName,
        {
          ...template.templateData,
          name: copyName,
        },
      );

      setBuilderTemplates((current) => [duplicatedTemplate, ...current]);
      showMessage('Template duplicated successfully', 'success');
    } catch (error) {
      ErrorHandlerService.handleError(error, 'shoppingListBuilderDuplicateTemplate');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditBuilderTemplate = (template: SavedBuilderTemplate) => {
    navigate(`/shopping-lists/builder?templateId=${template.id}`);
  };

  const handleDeleteBuilderTemplate = (template: SavedBuilderTemplate) => {
    setDeleteBuilderTemplate(template);
  };

  const handleConfirmDeleteBuilderTemplate = async () => {
    if (!deleteBuilderTemplate) return;

    try {
      setIsSaving(true);
      await shoppingListBuilderService.deleteSavedTemplate(deleteBuilderTemplate.id);
      setBuilderTemplates((current) => current.filter((template) => template.id !== deleteBuilderTemplate.id));
      setDeleteBuilderTemplate(null);
      showMessage('Template deleted successfully', 'success');
    } catch (error) {
      ErrorHandlerService.handleError(error, 'shoppingListBuilderDeleteTemplate');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadBuilderTemplatePdf = async (template: SavedBuilderTemplate) => {
    try {
      setIsSaving(true);
      const blob = await shoppingListBuilderService.createPreviewPdf(template.templateData);
      downloadPdfBlob(blob, buildExportFilename(exportSettings, {
        kind: 'preview',
        templateName: template.name,
      }));
      showMessage('Template PDF downloaded successfully', 'success');
    } catch (error) {
      ErrorHandlerService.handleError(error, 'shoppingListBuilderDownloadTemplatePdf');
    } finally {
      setIsSaving(false);
    }
  };

  // Opens the Translate & Generate modal for a saved template. The modal
  // runs its own multi-step flow (language pick -> pre-flight -> optional
  // translate-missing -> generate-and-download) so we just stash the
  // selected template here.
  //
  // "Which template" and "is open" are separate state on purpose. Deriving
  // `open` from the template and clearing the template on close unmounts the
  // modal in the same commit as the close, so Radix never reaches
  // `data-state="closed"` and the exit animation is skipped entirely. The
  // template is deliberately left set after closing so the subtree survives
  // long enough to animate out; the modal resets its own internal state on
  // each open, so a stale template is inert.
  const [translateTargetTemplate, setTranslateTargetTemplate] = useState<SavedBuilderTemplate | null>(null);
  const [isTranslateDialogOpen, setIsTranslateDialogOpen] = useState(false);
  const handleTranslateAndDownloadBuilderTemplatePdf = (template: SavedBuilderTemplate) => {
    setTranslateTargetTemplate(template);
    setIsTranslateDialogOpen(true);
  };

  const handleBulkDownloadBuilderTemplatePdfs = async (templates: SavedBuilderTemplate[]) => {
    if (templates.length === 0) return;

    try {
      setIsSaving(true);
      for (const template of templates) {
        const blob = await shoppingListBuilderService.createPreviewPdf(template.templateData);
        downloadPdfBlob(blob, buildExportFilename(exportSettings, {
          kind: 'preview',
          templateName: template.name,
        }));
      }
      showMessage(
        `Downloaded ${templates.length} template PDF${templates.length === 1 ? '' : 's'}`,
        'success',
      );
    } catch (error) {
      ErrorHandlerService.handleError(error, 'shoppingListBuilderBulkDownloadTemplatePdf');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBulkDuplicateBuilderTemplates = async (templates: SavedBuilderTemplate[]) => {
    if (templates.length === 0) return;

    try {
      setIsSaving(true);
      const duplicatedTemplates: SavedBuilderTemplate[] = [];

      for (const template of templates) {
        const copyName = limitBuilderTemplateName(`${template.name} (Copy)`);
        const duplicatedTemplate = await shoppingListBuilderService.createSavedTemplate(
          copyName,
          {
            ...template.templateData,
            name: copyName,
          },
        );
        duplicatedTemplates.push(duplicatedTemplate);
      }

      setBuilderTemplates((current) => [...duplicatedTemplates, ...current]);
      showMessage(
        `Duplicated ${templates.length} template${templates.length === 1 ? '' : 's'}`,
        'success',
      );
    } catch (error) {
      ErrorHandlerService.handleError(error, 'shoppingListBuilderBulkDuplicateTemplate');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBulkDeleteBuilderTemplates = (templates: SavedBuilderTemplate[]) => {
    setBulkDeleteBuilderTemplates(templates);
  };

  const closeBulkDeleteBuilderTemplatesDialog = () => {
    setBulkDeleteBuilderTemplates([]);
  };

  const handleConfirmBulkDeleteBuilderTemplates = async () => {
    if (bulkDeleteBuilderTemplates.length === 0) return;

    try {
      setIsSaving(true);
      const templateIds = new Set(bulkDeleteBuilderTemplates.map((template) => template.id));
      await Promise.all(
        bulkDeleteBuilderTemplates.map((template) =>
          shoppingListBuilderService.deleteSavedTemplate(template.id)
        )
      );

      setBuilderTemplates((current) => current.filter((template) => !templateIds.has(template.id)));
      showMessage(
        `Deleted ${bulkDeleteBuilderTemplates.length} template${bulkDeleteBuilderTemplates.length === 1 ? '' : 's'}`,
        'success',
      );
      closeBulkDeleteBuilderTemplatesDialog();
    } catch (error) {
      ErrorHandlerService.handleError(error, 'shoppingListBuilderBulkDeleteTemplate');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrintBuilderTemplate = async (template: SavedBuilderTemplate) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showMessage('The print window was blocked. Allow pop-ups for this local app, then try Print again.', 'warning');
      return;
    }

    printWindow.document.write('<!doctype html><title>Preparing shopping list PDF</title><body>Preparing PDF...</body>');
    printWindow.document.close();

    try {
      setIsSaving(true);
      const blob = await shoppingListBuilderService.createPreviewPdf(template.templateData);
      const url = URL.createObjectURL(blob);

      printWindow.location.href = url;
      printWindow.addEventListener('load', () => {
        printWindow.focus();
        printWindow.print();
      }, { once: true });

      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      printWindow.close();
      ErrorHandlerService.handleError(error, 'shoppingListBuilderPrintTemplate');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8" data-testid="shopping-lists-management">
      <ShoppingListList
        builderTemplates={builderTemplates}
        isLoadingBuilderTemplates={isLoadingBuilderTemplates}
        onOpenBuilder={() => navigate('/shopping-lists/builder')}
        onRenameBuilderTemplate={handleRenameBuilderTemplate}
        onDeleteBuilderTemplate={handleDeleteBuilderTemplate}
        onDuplicateBuilderTemplate={handleDuplicateBuilderTemplate}
        onEditBuilderTemplate={handleEditBuilderTemplate}
        onPrintBuilderTemplate={handlePrintBuilderTemplate}
        onDownloadBuilderTemplatePdf={handleDownloadBuilderTemplatePdf}
        onTranslateAndDownloadBuilderTemplatePdf={handleTranslateAndDownloadBuilderTemplatePdf}
        onBulkDownloadBuilderTemplatePdfs={handleBulkDownloadBuilderTemplatePdfs}
        onBulkDuplicateBuilderTemplates={handleBulkDuplicateBuilderTemplates}
        onBulkDeleteBuilderTemplates={handleBulkDeleteBuilderTemplates}
        onOpenExportSettings={() => setIsExportSettingsDialogOpen(true)}
      />

      <ExportSettingsDialog
        open={isExportSettingsDialogOpen}
        onOpenChange={(open) => {
          setIsExportSettingsDialogOpen(open);
          if (!open) void loadExportSettings();
        }}
      />

      {translateTargetTemplate && (
        <TranslateAndGenerateDialog
          template={translateTargetTemplate}
          open={isTranslateDialogOpen}
          onOpenChange={setIsTranslateDialogOpen}
          exportSettings={exportSettings}
        />
      )}

      {/* Rename Builder Template Dialog */}
      <Dialog
        open={isRenameBuilderTemplateDialogOpen}
        onOpenChange={(open) => {
          setIsRenameBuilderTemplateDialogOpen(open);
          if (!open) {
            closeRenameBuilderTemplateDialog();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Template</DialogTitle>
            <DialogDescription>
              Update the saved template name shown in the Shopping Lists table and builder.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-builder-template-name">Template Name</Label>
            <Input
              id="rename-builder-template-name"
              value={renameBuilderTemplateName}
              maxLength={MAX_SAVED_TEMPLATE_NAME_LENGTH}
              onChange={(event) => setRenameBuilderTemplateName(limitBuilderTemplateName(event.target.value))}
              disabled={isSaving}
            />
            <p className="text-xs text-muted-foreground">
              {renameBuilderTemplateName.length}/{MAX_SAVED_TEMPLATE_NAME_LENGTH} characters
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={closeRenameBuilderTemplateDialog}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleConfirmRenameBuilderTemplate} disabled={isSaving}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single Builder Template Delete Dialog */}
      <AlertDialog
        open={deleteBuilderTemplate !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteBuilderTemplate(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete saved template?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes &ldquo;{deleteBuilderTemplate?.name}&rdquo; from the Shopping Lists library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={isSaving}
              onClick={handleConfirmDeleteBuilderTemplate}
            >
              Delete template
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Builder Templates Dialog */}
      <AlertDialog
        open={bulkDeleteBuilderTemplates.length > 0}
        onOpenChange={(open) => {
          if (!open) closeBulkDeleteBuilderTemplatesDialog();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {bulkDeleteBuilderTemplates.length} saved template{bulkDeleteBuilderTemplates.length === 1 ? '' : 's'}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the selected templates from the Shopping Lists library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={isSaving}
              onClick={handleConfirmBulkDeleteBuilderTemplates}
            >
              Delete templates
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
