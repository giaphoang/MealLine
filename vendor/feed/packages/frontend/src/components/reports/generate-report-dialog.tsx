// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client";

/**
 * Report generation confirmation dialog (Reports initiative §3): ordered
 * selected blocks with accessible Move Up/Down/Remove, resolved
 * date/filter summary, editable 3–48-char title, PDF/CSV options (both on
 * by default, at least one required), and an optional Save/Update Shared
 * Template control (same-name saves update the matching template).
 */

import * as React from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { messageService } from "@/services/message";
import { reportsService } from "@/services/reports";
import {
  PlanningHorizon,
  ReportFilters,
  ReportCardOptionsMap,
  ReportSource,
  REPORT_CARD_TITLES,
  ReportsRangeRequest,
  ReportTemplateData,
} from "@/types/reports";
import { useReportSelection } from "./selection";

const TITLE_MIN = 3;
const TITLE_MAX = 48;

export function GenerateReportDialog({
  open,
  onOpenChange,
  range,
  rangeSummary,
  horizonDays,
  categoryIds,
  filters,
  cardOptions,
  onCardOptionsChange,
  onGenerated,
  source = "reports",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  range: ReportsRangeRequest;
  rangeSummary: string;
  horizonDays: PlanningHorizon;
  categoryIds?: number[];
  filters?: ReportFilters;
  cardOptions: ReportCardOptionsMap;
  onCardOptionsChange: (options: ReportCardOptionsMap) => void;
  onGenerated: () => void;
  source?: ReportSource;
}) {
  const { selectedIds, moveCard, removeCard } = useReportSelection();
  const [title, setTitle] = React.useState("Inventory Report");
  const [includePdf, setIncludePdf] = React.useState(true);
  const [includeCsv, setIncludeCsv] = React.useState(true);
  const [saveTemplate, setSaveTemplate] = React.useState(false);
  const [templateName, setTemplateName] = React.useState("");
  const [isGenerating, setIsGenerating] = React.useState(false);

  const trimmedTitle = title.trim().replace(/\s+/g, " ");
  const titleValid =
    trimmedTitle.length >= TITLE_MIN && trimmedTitle.length <= TITLE_MAX;
  const outputValid = includePdf || includeCsv;

  const handleGenerate = async () => {
    if (!titleValid) {
      messageService.error(
        `Report titles must be ${TITLE_MIN}–${TITLE_MAX} characters. Adjust the title before generating.`
      );
      return;
    }
    if (!outputValid) {
      messageService.error(
        "Select PDF, CSV, or both so the report has something to include."
      );
      return;
    }
    setIsGenerating(true);
    try {
      if (saveTemplate) {
        const name = (templateName.trim() || trimmedTitle).replace(/\s+/g, " ");
        const templateData: ReportTemplateData = {
          schemaVersion: 1,
          source,
          cardIds: selectedIds,
          range,
          horizonDays,
          filters: filters ?? (categoryIds ? { categoryIds } : {}),
          cardOptions,
        };
        await reportsService.saveTemplate(name, templateData);
        messageService.success(`Template "${name}" saved for everyone.`);
      }
      await reportsService.downloadExportZip({
        source,
        title: trimmedTitle,
        cardIds: selectedIds,
        range,
        horizonDays,
        filters: filters ?? (categoryIds ? { categoryIds } : {}),
        cardOptions,
        includePdf,
        includeCsv,
      });
      onOpenChange(false);
      onGenerated();
    } catch {
      messageService.error(
        "Unable to generate the report. Check your connection and try again."
      );
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !isGenerating && onOpenChange(next)}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Generate Report</DialogTitle>
          <DialogDescription>
            {rangeSummary} · {horizonDays}-day planning horizon
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Ordered blocks; order becomes PDF/CSV order */}
          <div className="space-y-2">
            <Label>Selected Blocks (export order)</Label>
            <ol className="space-y-1">
              {selectedIds.map((cardId, index) => (
                <li
                  key={cardId}
                  className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
                >
                  <span className="w-5 text-muted-foreground">{index + 1}.</span>
                  <span className="min-w-[140px] flex-1">
                    {REPORT_CARD_TITLES[cardId] ?? cardId}
                  </span>
                  {MAX_ROW_OPTION_CARDS.has(cardId) && (
                    <Select
                      value={String(cardOptions[cardId]?.maxRows ?? 10)}
                      onValueChange={(value) => onCardOptionsChange({
                        ...cardOptions,
                        [cardId]: { maxRows: Number(value) as 5 | 10 },
                      })}
                      disabled={isGenerating}
                    >
                      <SelectTrigger
                        className="h-7 w-[82px]"
                        aria-label={`Rows for ${REPORT_CARD_TITLES[cardId] ?? cardId}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">Top 5</SelectItem>
                        <SelectItem value="10">Top 10</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={`Move ${REPORT_CARD_TITLES[cardId] ?? cardId} up`}
                    disabled={index === 0 || isGenerating}
                    onClick={() => moveCard(cardId, -1)}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={`Move ${REPORT_CARD_TITLES[cardId] ?? cardId} down`}
                    disabled={index === selectedIds.length - 1 || isGenerating}
                    onClick={() => moveCard(cardId, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={`Remove ${REPORT_CARD_TITLES[cardId] ?? cardId}`}
                    disabled={isGenerating}
                    onClick={() => removeCard(cardId)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  </div>
                </li>
              ))}
            </ol>
            {selectedIds.length === 0 && (
              <p className="text-sm text-muted-foreground">
                All blocks were removed. Close this dialog and select at least
                one block to generate a report.
              </p>
            )}
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="report-title">Report Title</Label>
            <Input
              id="report-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={TITLE_MAX}
              disabled={isGenerating}
              className={!titleValid && title.length > 0 ? "border-destructive" : ""}
            />
          </div>

          {/* Output formats */}
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            <div className="flex items-center gap-2">
              <Checkbox
                id="include-pdf"
                checked={includePdf}
                onCheckedChange={(checked) => setIncludePdf(checked === true)}
                disabled={isGenerating}
              />
              <Label htmlFor="include-pdf">PDF (landscape)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="include-csv"
                checked={includeCsv}
                onCheckedChange={(checked) => setIncludeCsv(checked === true)}
                disabled={isGenerating}
              />
              <Label htmlFor="include-csv">CSV (one per block)</Label>
            </div>
          </div>

          {/* Save as shared template */}
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="save-template"
                checked={saveTemplate}
                onCheckedChange={(checked) => setSaveTemplate(checked === true)}
                disabled={isGenerating}
              />
              <Label htmlFor="save-template">
                Save/Update Shared Template
              </Label>
            </div>
            {saveTemplate && (
              <Input
                aria-label="Template name"
                placeholder={trimmedTitle || "Template name"}
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                maxLength={TITLE_MAX}
                disabled={isGenerating}
              />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isGenerating}
          >
            Back
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || selectedIds.length === 0}
          >
            {isGenerating ? "Generating..." : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const MAX_ROW_OPTION_CARDS = new Set([
  "unit-prices-cost-trends",
  "unit-prices-cost-impact",
  "scarcity-stockout-frequency",
  "replenishment-reorder-priority",
]);
