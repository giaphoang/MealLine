// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client";

// Shared building blocks for the Reports workspace tabs.

import * as React from "react";
import { Download } from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { type ChartConfig } from "@/components/ui/chart";
import { getChartColor } from "@/lib/colors";
import { formatCentsAsUsd } from "@/lib/formatting/currency";

export const formatDays = (value: number | null): string =>
  value === null ? "Unknown" : `${value.toFixed(1)} d`;

export const formatCount = (value: number | null): string =>
  value === null ? "Unknown" : String(value);

export const formatPercent = (value: number | null): string =>
  value === null ? "Unknown" : `${value.toFixed(0)}%`;

export const formatDate = (iso: string | null): string =>
  iso === null ? "—" : format(new Date(iso), "MMM d, yyyy");

export const formatDateTime = (iso: string | null): string =>
  iso === null ? "—" : format(new Date(iso), "MMM d, yyyy h:mm a");

/** Cents (possibly fractional, full precision) → display currency. */
export const formatCents = (cents: number | null): string =>
  cents === null ? "Unknown" : formatCentsAsUsd(Math.round(cents));

/** Centralized single-series chart config (lib/colors.ts palette index). */
export function seriesChartConfig(
  key: string,
  label: string,
  colorIndex: number
): ChartConfig {
  return {
    [key]: {
      label,
      theme: {
        light: getChartColor(colorIndex, "light"),
        dark: getChartColor(colorIndex, "dark"),
      },
    },
  };
}

export function ExportCsvButton({
  cardId,
  onExportCsv,
}: {
  cardId: string;
  onExportCsv: (cardId: string) => void;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onExportCsv(cardId)}
      aria-label="Export this block as CSV"
    >
      <Download className="mr-1 h-4 w-4" />
      Export CSV
    </Button>
  );
}

export function KpiStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function TabSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-32 w-full" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

export function TabLoadError() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Report unavailable</CardTitle>
        <CardDescription>
          Unable to load the report data. Check your connection and try again.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

export interface ReportTabProps<TResult> {
  result: TResult | null;
  isLoading: boolean;
  loadFailed: boolean;
  onExportCsv: (cardId: string) => void;
}

/** Wraps the common loading / error / empty gate around a tab body. */
export function TabStateGate<TResult>({
  result,
  isLoading,
  loadFailed,
  children,
}: {
  result: TResult | null;
  isLoading: boolean;
  loadFailed: boolean;
  children: (result: TResult) => React.ReactNode;
}) {
  if (isLoading && !result) return <TabSkeleton />;
  if (loadFailed && !result) return <TabLoadError />;
  if (!result) return null;
  return <>{children(result)}</>;
}
