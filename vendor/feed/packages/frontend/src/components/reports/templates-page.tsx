// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client";

/**
 * Shared report template management (/reports/templates). Templates are
 * organization-wide; Apply restores the template's controls and selection
 * on its source page, Generate exports directly, and stale card ids are
 * surfaced as "needs attention" rather than silently dropped.
 */

import * as React from "react";
import { useNavigate } from "react-router-dom";
import { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, Copy, Download, Play, Trash2 } from "lucide-react";
import { Pencil } from "@/components/ui/icons";
import { format } from "date-fns";

import { SectionHeader } from "@/components/shared/section-header";
import { createPageTitleIcon } from "@/components/layout/page-title-icon";
import { FileChartColumnIcon } from "@/components/ui/file-chart-column";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EnhancedDataTable } from "@/components/ui/enhanced-data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableActionMenu } from "@/components/ui/table-action-menu";
import { messageService } from "@/services/message";
import { reportsService } from "@/services/reports";
import {
  RANGE_PRESET_LABELS,
  ReportTemplate,
} from "@/types/reports";

const PageTitleReportsIcon = createPageTitleIcon(FileChartColumnIcon);

export function ReportTemplatesPage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = React.useState<ReportTemplate[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [renameTarget, setRenameTarget] = React.useState<ReportTemplate | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState<ReportTemplate | null>(null);
  const [isBusy, setIsBusy] = React.useState(false);

  const refresh = React.useCallback(async () => {
    try {
      setIsLoading(true);
      setTemplates(await reportsService.getTemplates());
    } catch {
      messageService.error(
        "Unable to load the shared templates. Check your connection and try again."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleApply = (template: ReportTemplate) => {
    // Source-bound: reports templates open the Reports workspace with the
    // template's controls and selection restored. (Dashboard templates
    // will navigate to the Dashboard once Phase 4 lands.)
    const usableCards = template.templateData.cardIds.filter(
      (id) => !template.staleCardIds.includes(id)
    );
    navigate(template.source === "dashboard" ? "/" : "/reports", {
      state: {
        applyTemplate: {
          cardIds: usableCards,
          range: template.templateData.range,
          horizonDays: template.templateData.horizonDays,
          filters: template.templateData.filters ?? (
            template.templateData.categoryIds
              ? { categoryIds: template.templateData.categoryIds }
              : {}
          ),
          cardOptions: template.templateData.cardOptions ?? {},
        },
      },
    });
    if (template.staleCardIds.length > 0) {
      messageService.error(
        `${template.staleCardIds.length} block(s) in "${template.name}" need attention: they no longer exist and were left out of the selection.`
      );
    }
  };

  const handleGenerate = async (template: ReportTemplate) => {
    const usableCards = template.templateData.cardIds.filter(
      (id) => !template.staleCardIds.includes(id)
    );
    if (usableCards.length === 0) {
      messageService.error(
        `"${template.name}" has no usable blocks. Edit the template before generating.`
      );
      return;
    }
    try {
      // Relative presets resolve fresh at generation time on the server.
      await reportsService.downloadExportZip({
        source: template.source,
        title: template.name,
        cardIds: usableCards,
        range: template.templateData.range,
        horizonDays: template.templateData.horizonDays,
        filters: template.templateData.filters ?? (
          template.templateData.categoryIds
            ? { categoryIds: template.templateData.categoryIds }
            : {}
        ),
        cardOptions: template.templateData.cardOptions ?? {},
        includePdf: true,
        includeCsv: true,
      });
    } catch {
      messageService.error(
        "Unable to generate the report. Check your connection and try again."
      );
    }
  };

  const handleRename = async () => {
    if (!renameTarget) return;
    const name = renameValue.trim().replace(/\s+/g, " ");
    if (name.length < 3 || name.length > 48) {
      messageService.error(
        "Template names must be 3–48 characters. Adjust the name before saving."
      );
      return;
    }
    setIsBusy(true);
    try {
      await reportsService.updateTemplate(renameTarget.id, { name });
      setRenameTarget(null);
      await refresh();
      messageService.success("Template renamed.");
    } catch (error) {
      messageService.error(
        error instanceof Error
          ? error.message
          : "Unable to rename the template. Try again."
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleDuplicate = async (template: ReportTemplate) => {
    const base = `${template.name} Copy`;
    const name = base.slice(0, 48);
    try {
      await reportsService.saveTemplate(name, template.templateData);
      await refresh();
      messageService.success(`Duplicated as "${name}".`);
    } catch {
      messageService.error(
        "Unable to duplicate the template. Try again."
      );
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsBusy(true);
    try {
      await reportsService.deleteTemplate(deleteTarget.id);
      setDeleteTarget(null);
      await refresh();
      messageService.success("Template deleted.");
    } catch {
      messageService.error("Unable to delete the template. Try again.");
    } finally {
      setIsBusy(false);
    }
  };

  const columns: ColumnDef<ReportTemplate>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <span className="flex items-center gap-2">
          {row.original.name}
          {row.original.staleCardIds.length > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              needs attention
            </Badge>
          )}
        </span>
      ),
    },
    {
      accessorKey: "source",
      header: "Source",
      cell: ({ row }) =>
        row.original.source === "reports" ? "Reports" : "Dashboard",
    },
    {
      id: "blocks",
      header: "Blocks",
      cell: ({ row }) => row.original.templateData.cardIds.length,
    },
    {
      id: "range",
      header: "Date Range",
      cell: ({ row }) => {
        const { range } = row.original.templateData;
        return range.preset === "custom"
          ? `${range.startDate} – ${range.endDate}`
          : RANGE_PRESET_LABELS[range.preset];
      },
    },
    {
      id: "horizon",
      header: "Horizon",
      cell: ({ row }) => `${row.original.templateData.horizonDays} days`,
    },
    {
      accessorKey: "updatedAt",
      header: "Updated",
      cell: ({ row }) =>
        format(new Date(row.original.updatedAt), "MMM d, yyyy"),
    },
    {
      id: "actions",
      header: "Actions",
      enableHiding: false,
      cell: ({ row }) => (
        <TableActionMenu
          actions={[
            {
              label: "Apply/Edit",
              icon: Play,
              onClick: () => handleApply(row.original),
            },
            {
              label: "Generate",
              icon: Download,
              onClick: () => void handleGenerate(row.original),
            },
            {
              label: "Rename",
              icon: Pencil,
              onClick: () => {
                setRenameTarget(row.original);
                setRenameValue(row.original.name);
              },
            },
            {
              label: "Duplicate",
              icon: Copy,
              onClick: () => void handleDuplicate(row.original),
            },
            {
              label: "Delete",
              icon: Trash2,
              variant: "destructive",
              onClick: () => setDeleteTarget(row.original),
            },
          ]}
          triggerLabel="Open template actions"
          size="sm"
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Report Templates"
        description="Shared, organization-wide report configurations. Relative date presets resolve fresh each time a template runs."
        icon={PageTitleReportsIcon}
      />

      <EnhancedDataTable
        columns={columns}
        data={templates}
        isLoading={isLoading}
        filterColumn="name"
        filterPlaceholder="Filter templates..."
      />

      {/* Rename dialog */}
      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => !open && !isBusy && setRenameTarget(null)}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Rename Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="template-rename">Name</Label>
            <Input
              id="template-rename"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              maxLength={48}
              disabled={isBusy}
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setRenameTarget(null)}
              disabled={isBusy}
            >
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={isBusy}>
              {isBusy ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && !isBusy && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this shared template?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" is shared with everyone and will be
              removed for all users. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isBusy ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
