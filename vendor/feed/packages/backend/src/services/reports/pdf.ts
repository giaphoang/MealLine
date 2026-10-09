// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Report PDF renderer (Reports initiative §3).
 *
 * Letter landscape, deterministic light print theme, Noto fonts,
 * server-authored inline SVG charts (never screenshot/serialized
 * Recharts), two-column visualization layout with full-width tables,
 * repeated table headers, direct value labels so meaning does not depend
 * on color, and a Chromium-native Page X of Y footer. The HTML is fully
 * self-contained; rendering happens with the network disabled.
 */

import {
  escapeHtml,
  getReportFontCss,
  renderHtmlToPdf,
} from '../pdf/chromium';
import { printBrand } from '../brand-config';
import { TabResults } from '../inventory-analytics';
import { ReportCardDefinition } from './card-registry';
import type { DashboardSnapshot } from './dashboard';
import {
  DEFAULT_REPORT_PRINT_THEME, currentReportPrintTheme, withReportPrintTheme, type ReportPrintTheme } from './print-theme';

// ---- shared print formatting (mirrors the frontend display helpers) --------

const fmtDays = (value: number | null): string =>
  value === null ? 'Unknown' : `${value.toFixed(1)} d`;
const fmtCount = (value: number | null): string =>
  value === null ? 'Unknown' : String(value);
const fmtPercent = (value: number | null): string =>
  value === null ? 'Unknown' : `${value.toFixed(0)}%`;
const fmtCents = (cents: number | null): string => {
  if (cents === null) return 'Unknown';
  const rounded = Math.round(cents);
  const dollars = Math.floor(Math.abs(rounded) / 100);
  const remainder = Math.abs(rounded) % 100;
  return `${rounded < 0 ? '−' : ''}$${dollars}.${String(remainder).padStart(2, '0')}`;
};
const fmtDate = (iso: string | null): string =>
  iso === null ? '—' : new Date(iso).toISOString().slice(0, 10);

// ---- inline SVG charts ------------------------------------------------------

// Print palette: one ink-friendly blue; direct labels carry the meaning.
const barFill = () => currentReportPrintTheme().primary;
const barFillSecondary = () => currentReportPrintTheme().palette[1] ?? currentReportPrintTheme().primarySoft;
const axisColor = () => currentReportPrintTheme().muted;
const labelColor = () => currentReportPrintTheme().ink;

interface BarDatum {
  label: string;
  value: number;
  secondary?: number;
}

/** Vertical bar chart with direct value labels above each bar. */
function barChartSvg(
  data: BarDatum[],
  options: { width?: number; height?: number; format?: (v: number) => string } = {}
): string {
  const width = options.width ?? 460;
  const height = options.height ?? 220;
  const format = options.format ?? ((v: number) => String(v));
  if (data.length === 0) {
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-size="11" fill="${axisColor()}">No data in this range</text></svg>`;
  }
  const margin = { top: 18, right: 8, bottom: 34, left: 8 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const hasSecondary = data.some((d) => d.secondary !== undefined);
  const max = Math.max(
    1,
    ...data.map((d) => Math.max(Math.abs(d.value), Math.abs(d.secondary ?? 0)))
  );
  const slot = innerW / data.length;
  const barW = Math.min(hasSecondary ? slot * 0.32 : 40, hasSecondary ? slot * 0.32 : slot * 0.6);

  const bars = data
    .map((d, i) => {
      const cx = margin.left + slot * i + slot / 2;
      const parts: string[] = [];
      const drawBar = (value: number, fill: string, offset: number) => {
        const h = (Math.abs(value) / max) * innerH;
        const x = cx + offset - barW / 2;
        const y = margin.top + innerH - h;
        parts.push(
          `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}" rx="2"/>`,
          `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" font-size="9" fill="${labelColor()}">${escapeHtml(format(d.value === value ? d.value : value))}</text>`
        );
      };
      if (hasSecondary) {
        drawBar(d.secondary ?? 0, barFillSecondary(), -barW * 0.6);
        drawBar(d.value, barFill(), barW * 0.6);
      } else {
        drawBar(d.value, barFill(), 0);
      }
      const label = d.label.length > 14 ? `${d.label.slice(0, 13)}…` : d.label;
      parts.push(
        `<text x="${cx.toFixed(1)}" y="${height - 18}" text-anchor="middle" font-size="9" fill="${axisColor()}">${escapeHtml(label)}</text>`
      );
      return parts.join('');
    })
    .join('');

  const baseline = `<line x1="${margin.left}" y1="${margin.top + innerH}" x2="${width - margin.right}" y2="${margin.top + innerH}" stroke="${axisColor()}" stroke-width="0.75"/>`;
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img">${baseline}${bars}</svg>`;
}

/** Horizontal bar chart (item rankings) with value labels at bar ends. */
function hBarChartSvg(
  data: BarDatum[],
  options: { width?: number; format?: (v: number) => string } = {}
): string {
  const width = options.width ?? 460;
  const format = options.format ?? ((v: number) => String(v));
  const rowH = 22;
  const margin = { top: 6, right: 60, bottom: 6, left: 150 };
  const height = margin.top + margin.bottom + Math.max(1, data.length) * rowH;
  if (data.length === 0) {
    return `<svg width="${width}" height="120" viewBox="0 0 ${width} 120" xmlns="http://www.w3.org/2000/svg"><text x="${width / 2}" y="60" text-anchor="middle" font-size="11" fill="${axisColor()}">No data in this range</text></svg>`;
  }
  const innerW = width - margin.left - margin.right;
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  const rows = data
    .map((d, i) => {
      const y = margin.top + rowH * i;
      const w = (Math.abs(d.value) / max) * innerW;
      const label = d.label.length > 24 ? `${d.label.slice(0, 23)}…` : d.label;
      return [
        `<text x="${margin.left - 6}" y="${y + rowH / 2 + 3}" text-anchor="end" font-size="9" fill="${labelColor()}">${escapeHtml(label)}</text>`,
        `<rect x="${margin.left}" y="${y + 4}" width="${w.toFixed(1)}" height="${rowH - 8}" fill="${barFill()}" rx="2"/>`,
        `<text x="${(margin.left + w + 4).toFixed(1)}" y="${y + rowH / 2 + 3}" font-size="9" fill="${labelColor()}">${escapeHtml(format(d.value))}</text>`,
      ].join('');
    })
    .join('');
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img">${rows}</svg>`;
}

/** Step-area chart for time series (availability %). Gaps stay gaps. */
function areaChartSvg(
  points: { label: string; value: number | null }[],
  options: { width?: number; height?: number; maxY?: number } = {}
): string {
  const width = options.width ?? 460;
  const height = options.height ?? 220;
  const margin = { top: 12, right: 8, bottom: 30, left: 34 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const known = points.filter((p) => p.value !== null);
  if (known.length === 0) {
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-size="11" fill="${axisColor()}">No tracked data in this range</text></svg>`;
  }
  const maxY = options.maxY ?? Math.max(1, ...known.map((p) => p.value as number));
  const stepX = points.length > 1 ? innerW / (points.length - 1) : innerW;
  const xy = (index: number, value: number) => ({
    x: margin.left + stepX * index,
    y: margin.top + innerH - (value / maxY) * innerH,
  });

  // Build contiguous segments; null values break the line.
  const segments: string[] = [];
  let current: string[] = [];
  points.forEach((point, index) => {
    if (point.value === null) {
      if (current.length > 1) segments.push(current.join(' '));
      current = [];
      return;
    }
    const { x, y } = xy(index, point.value);
    current.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  });
  if (current.length > 1) segments.push(current.join(' '));

  const lines = segments
    .map(
      (segment) =>
        `<polyline points="${segment}" fill="none" stroke="${barFill()}" stroke-width="1.5"/>`
    )
    .join('');

  const first = points[0]?.label ?? '';
  const last = points[points.length - 1]?.label ?? '';
  const gridY = [0, 0.5, 1]
    .map((fraction) => {
      const y = margin.top + innerH - innerH * fraction;
      const value = maxY * fraction;
      return `<line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="#dddddd" stroke-width="0.5"/><text x="${margin.left - 4}" y="${y + 3}" text-anchor="end" font-size="8" fill="${axisColor()}">${Math.round(value)}</text>`;
    })
    .join('');

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img">${gridY}${lines}<text x="${margin.left}" y="${height - 12}" font-size="9" fill="${axisColor()}">${escapeHtml(first)}</text><text x="${width - margin.right}" y="${height - 12}" text-anchor="end" font-size="9" fill="${axisColor()}">${escapeHtml(last)}</text></svg>`;
}

// ---- per-card HTML blocks ----------------------------------------------------

interface RenderContext {
  tabs: Partial<TabResults>;
  horizonDays: number;
  dashboard?: DashboardSnapshot;
}

function requireTab<K extends keyof TabResults>(
  context: RenderContext,
  tab: K,
  cardId: string
): TabResults[K] {
  const result = context.tabs[tab];
  if (!result) throw new Error(`Missing ${tab} data for report card ${cardId}`);
  return result as TabResults[K];
}

const kpiGrid = (stats: { label: string; value: string; hint?: string }[]): string =>
  `<div class="kpi-grid">${stats
    .map(
      (stat) =>
        `<div class="kpi"><div class="kpi-label">${escapeHtml(stat.label)}</div><div class="kpi-value">${escapeHtml(stat.value)}</div>${stat.hint ? `<div class="kpi-hint">${escapeHtml(stat.hint)}</div>` : ''}</div>`
    )
    .join('')}</div>`;

const dataTable = (headers: string[], rows: string[][]): string => {
  const head = `<thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>`;
  const body =
    rows.length === 0
      ? `<tbody><tr><td colspan="${headers.length}" class="empty">No rows in this range</td></tr></tbody>`
      : `<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody>`;
  return `<table class="data-table">${head}${body}</table>`;
};

/** One card's inner HTML (title/notice handled by the shell). */
function cardBodyHtml(card: ReportCardDefinition, context: RenderContext): string {
  const { horizonDays } = context;
  switch (card.id) {
    case 'inventory-outlook-kpi': {
      const { kpis } = requireTab(context, 'inventory-outlook', card.id);
      return kpiGrid([
        { label: 'In Stock', value: `${kpis.inStockItems} / ${kpis.totalItems}`, hint: kpis.availabilityPercent === null ? undefined : `${kpis.availabilityPercent.toFixed(0)}% availability` },
        { label: 'Known Quantities', value: String(kpis.itemsWithKnownQuantity), hint: `of ${kpis.totalItems} items` },
        { label: 'Median Days of Cover', value: kpis.medianDaysOfCover === null ? 'Unknown' : kpis.medianDaysOfCover.toFixed(1), hint: `${kpis.itemsWithComputableCover} calculable items` },
        { label: `Projected Stockouts (${kpis.horizonDays}d)`, value: String(kpis.projectedStockoutsWithinHorizon) },
      ]);
    }
    case 'inventory-outlook-cover-bands': {
      const result = requireTab(context, 'inventory-outlook', card.id);
      return barChartSvg(
        result.daysOfCoverBands.map((band) => ({ label: band.band, value: band.itemCount }))
      );
    }
    case 'inventory-outlook-stockout-timeline': {
      const result = requireTab(context, 'inventory-outlook', card.id);
      return barChartSvg(
        result.stockoutTimeline.map((bucket) => ({
          label: `wk of ${bucket.weekStart.slice(5)}`,
          value: bucket.itemCount,
        }))
      );
    }
    case 'inventory-outlook-item-table': {
      const result = requireTab(context, 'inventory-outlook', card.id);
      return dataTable(
        ['Name', 'Category', 'Qty', 'Weekly Burn', 'Days of Cover', 'Projected Stockout', 'Purchases', 'Projected Cost', 'Data Status'],
        result.items.map((item) => [
          item.name,
          item.categoryName,
          fmtCount(item.estimatedQuantity),
          item.weeklyBurn === null ? 'Unknown' : item.weeklyBurn.toFixed(1),
          fmtDays(item.daysOfCover),
          fmtDate(item.projectedStockoutAt),
          fmtCount(item.purchasesNeeded),
          item.priceType === 'unknown' ? 'Unknown' : fmtCents(item.projectedCostCents),
          item.dataStatus,
        ])
      );
    }

    case 'unit-prices-kpi': {
      const { kpis } = requireTab(context, 'unit-prices', card.id);
      return kpiGrid([
        { label: 'Purchased', value: String(kpis.paidItems), hint: `of ${kpis.totalItems} items` },
        { label: 'Donated/Free', value: String(kpis.donatedItems) },
        { label: 'Unknown Price', value: String(kpis.unknownPriceItems) },
        { label: 'Recent Price Changes', value: String(kpis.priceChangesInRange), hint: `${kpis.itemsWithPriceChangeInRange} items in range` },
      ]);
    }
    case 'unit-prices-cost-trends': {
      const result = requireTab(context, 'unit-prices', card.id);
      return barChartSvg(
        result.unitCostChanges.map((row) => ({
          label: row.itemName,
          value: Math.round(row.latestUnitCostCents),
          secondary: Math.round(row.previousUnitCostCents),
        })),
        { format: (v) => fmtCents(v) }
      );
    }
    case 'unit-prices-cost-impact': {
      const result = requireTab(context, 'unit-prices', card.id);
      return hBarChartSvg(
        result.costImpacts.map((row) => ({
          label: row.itemName,
          value: Math.round(row.impactCents),
        })),
        { format: (v) => fmtCents(v) }
      );
    }
    case 'unit-prices-history-table': {
      const result = requireTab(context, 'unit-prices', card.id);
      return dataTable(
        ['Recorded', 'Name', 'Category', 'Price Type', 'Purchase Price', 'Units', 'Unit Cost', 'Change'],
        result.priceHistory.map((row) => [
          fmtDate(row.at),
          row.itemName,
          row.categoryName,
          row.priceType,
          fmtCents(row.purchasePriceCents),
          String(row.unitsPerPurchase),
          fmtCents(row.unitCostCents),
          row.changeCents === null ? '—' : fmtCents(row.changeCents),
        ])
      );
    }

    case 'scarcity-kpi': {
      const { kpis } = requireTab(context, 'scarcity', card.id);
      return kpiGrid([
        { label: 'Availability', value: fmtPercent(kpis.availabilityItemDaysPercent), hint: 'share of tracked item-days in stock' },
        { label: 'Stockout Episodes', value: String(kpis.stockoutEpisodes), hint: `${kpis.itemsWithStockout} items affected` },
        { label: 'Ongoing Stockouts', value: String(kpis.ongoingStockouts) },
        { label: 'Avg. Days to Restock', value: kpis.averageRestockDays === null ? 'Unknown' : kpis.averageRestockDays.toFixed(1), hint: 'actual restocks only' },
      ]);
    }
    case 'scarcity-availability-over-time': {
      const result = requireTab(context, 'scarcity', card.id);
      return areaChartSvg(
        result.availabilityOverTime.map((point) => ({
          label: point.date.slice(5),
          value: point.availabilityPercent,
        })),
        { maxY: 100 }
      );
    }
    case 'scarcity-stockout-frequency': {
      const result = requireTab(context, 'scarcity', card.id);
      return hBarChartSvg(
        result.stockoutFrequency.map((row) => ({
          label: row.itemName,
          value: row.episodeCount,
        }))
      );
    }
    case 'scarcity-episodes-table': {
      const result = requireTab(context, 'scarcity', card.id);
      return dataTable(
        ['Name', 'Category', 'Out of Stock Since', 'Back in Stock', 'Duration', 'Ended By'],
        result.episodes.map((episode) => [
          episode.itemName,
          episode.categoryName,
          fmtDate(episode.startAt),
          fmtDate(episode.endAt),
          fmtDays(episode.durationDays),
          episode.endedBy,
        ])
      );
    }

    case 'replenishment-kpi': {
      const { kpis } = requireTab(context, 'replenishment', card.id);
      return kpiGrid([
        { label: 'Items Needing Purchase', value: String(kpis.itemsNeedingPurchase) },
        { label: 'Urgent (≤7d cover)', value: String(kpis.urgentItems) },
        { label: 'Known Spend', value: fmtCents(kpis.knownSpendCents), hint: kpis.donatedDemandItems > 0 ? `${kpis.donatedDemandItems} donated items excluded` : undefined },
        { label: 'Missing Inputs', value: String(kpis.missingInputItems), hint: 'items lacking quantity, history, or price' },
      ]);
    }
    case 'replenishment-reorder-priority': {
      const result = requireTab(context, 'replenishment', card.id);
      return hBarChartSvg(
        result.reorderPriority.map((row) => ({
          label: row.isInStock ? row.name : `${row.name} (Out)`,
          value: row.isInStock && row.daysOfCover !== null
            ? Number(row.daysOfCover.toFixed(1))
            : 0,
        })),
        { format: (v) => v === 0 ? 'Out' : `${v} d` }
      );
    }
    case 'replenishment-spend-by-category': {
      const result = requireTab(context, 'replenishment', card.id);
      return barChartSvg(
        result.spendByCategory.map((row) => ({
          label: row.categoryName,
          value: row.knownSpendCents,
        })),
        { format: (v) => fmtCents(v) }
      );
    }
    case 'replenishment-plan-table': {
      const result = requireTab(context, 'replenishment', card.id);
      return dataTable(
        ['Name', 'Category', 'Qty', 'Days of Cover', 'Required Units', 'Purchases', 'Projected Cost', 'Missing Inputs'],
        result.plan.map((row) => [
          row.name,
          row.categoryName,
          fmtCount(row.estimatedQuantity),
          fmtDays(row.daysOfCover),
          fmtCount(row.requiredUnits),
          fmtCount(row.purchasesNeeded),
          row.priceType === 'unknown' ? 'Unknown' : fmtCents(row.projectedCostCents),
          row.missingInputs.length === 0 ? '—' : row.missingInputs.join(', '),
        ])
      );
    }

    case 'data-coverage-kpi': {
      const { kpis } = requireTab(context, 'data-coverage', card.id);
      return kpiGrid([
        { label: 'Quantity Coverage', value: fmtPercent(kpis.quantityCoveragePercent), hint: `of ${kpis.liveItems} items` },
        { label: 'Price Coverage', value: fmtPercent(kpis.priceCoveragePercent) },
        { label: 'Burn-Ready', value: fmtPercent(kpis.burnReadyPercent) },
        { label: 'Ledger Events', value: String(kpis.eventsInRange), hint: 'recorded in this range' },
      ]);
    }
    case 'data-coverage-burn-readiness': {
      const result = requireTab(context, 'data-coverage', card.id);
      return barChartSvg(
        result.burnReadiness.map((row) => ({ label: row.status, value: row.itemCount }))
      );
    }
    case 'data-coverage-recording-activity': {
      const result = requireTab(context, 'data-coverage', card.id);
      return barChartSvg(
        result.recordingActivity.map((row) => ({
          label: `wk of ${row.weekStart.slice(5)}`,
          value: row.eventCount,
        }))
      );
    }
    case 'data-coverage-gaps-table': {
      const result = requireTab(context, 'data-coverage', card.id);
      return dataTable(
        ['Name', 'Category', 'Quantity', 'Price', 'Burn-Ready', 'Last Quantity Change'],
        result.gaps.map((row) => [
          row.name,
          row.categoryName,
          row.hasQuantity ? 'Yes' : 'No',
          row.hasPrice ? 'Yes' : 'No',
          row.burnReady ? 'Yes' : 'No',
          fmtDate(row.lastQuantityChangeAt),
        ])
      );
    }

    case 'dashboard-overview-categories': {
      const data = requireDashboard(context, card.id);
      return kpiGrid([
        { label: 'Categories', value: String(data.overview.categories.total) },
        { label: 'Assigned No Limit', value: fmtPercent(data.overview.categories.noLimitPercentage) },
      ]);
    }
    case 'dashboard-overview-food-items': {
      const data = requireDashboard(context, card.id);
      return kpiGrid([
        { label: 'Food Items', value: String(data.overview.foodItems.total) },
        { label: 'In Stock', value: String(data.overview.foodItems.inStock), hint: fmtPercent(data.overview.foodItems.inStockPercentage) },
      ]);
    }
    case 'dashboard-overview-languages': {
      const data = requireDashboard(context, card.id);
      return kpiGrid([
        { label: 'Languages', value: String(data.overview.languages.total) },
        { label: 'Active', value: String(data.overview.languages.active) },
      ]);
    }
    case 'dashboard-overview-translations': {
      const data = requireDashboard(context, card.id);
      return kpiGrid([
        { label: 'Translations', value: String(data.overview.translations.total) },
        { label: 'Success Rate', value: fmtPercent(data.overview.translations.successRate) },
      ]);
    }
    case 'dashboard-inventory-status': {
      const data = requireDashboard(context, card.id);
      return barChartSvg(data.inventoryStatus.map((row) => ({ label: row.status, value: row.itemCount })));
    }
    case 'dashboard-category-distribution': {
      const data = requireDashboard(context, card.id);
      return hBarChartSvg(data.categoryDistribution.slice(0, 10).map((row) => ({ label: row.categoryName, value: row.itemCount })));
    }
    case 'dashboard-translation-success': {
      const data = requireDashboard(context, card.id);
      return barChartSvg([
        { label: 'Completed', value: data.translationSuccess.completed },
        { label: 'Pending', value: data.translationSuccess.pending },
        { label: 'Failed', value: data.translationSuccess.failed },
      ]);
    }
    case 'dashboard-projected-stockouts': {
      const data = requireDashboard(context, card.id);
      return kpiGrid([{ label: 'Within 30 Days', value: String(data.logistics.projectedStockouts) }]);
    }
    case 'dashboard-quantity-coverage': {
      const data = requireDashboard(context, card.id);
      return kpiGrid([{ label: 'Quantity Coverage', value: fmtPercent(data.logistics.quantityCoveragePercent), hint: `${data.logistics.quantityKnownItems} of ${data.logistics.totalItems} items` }]);
    }
    case 'dashboard-median-cover': {
      const data = requireDashboard(context, card.id);
      return kpiGrid([{ label: 'Median Days of Cover', value: fmtDays(data.logistics.medianDaysOfCover), hint: `${data.logistics.coverReadyItems} calculable items` }]);
    }
    case 'dashboard-replenishment-cost': {
      const data = requireDashboard(context, card.id);
      return kpiGrid([{ label: 'Known 30-Day Cost', value: fmtCents(data.logistics.knownReplenishmentCostCents), hint: `${data.logistics.donatedDemandItems} donated and ${data.logistics.unknownCostDemandItems} unknown-cost items excluded` }]);
    }

    default:
      throw new Error(`No PDF renderer for report card: ${card.id}`);
  }
}

function requireDashboard(context: RenderContext, cardId: string): DashboardSnapshot {
  if (!context.dashboard) throw new Error(`Missing dashboard data for report card ${cardId}`);
  return context.dashboard;
}

// ---- document shell -----------------------------------------------------------

export interface ReportPdfOptions {
  title: string;
  rangeLabel: string;
  timeZone: string;
  horizonDays: number;
  filtersSummary: string;
  dataAsOf: string;
  cards: ReportCardDefinition[];
  tabs: Partial<TabResults>;
  dashboard?: DashboardSnapshot;
  /** Data-quality notices printed under the header. */
  notices: string[];
}

export async function renderReportPdfHtml(
  options: ReportPdfOptions
): Promise<string> {
  const fontCss = await getReportFontCss();
  const brand = await printBrand();
  const theme: ReportPrintTheme = {
    palette: brand.chartColors,
    ink: brand.colors.foreground,
    muted: brand.colors['muted-foreground'],
    grid: brand.colors.border,
    background: brand.colors.background,
    primary: brand.colors.primary,
    note: DEFAULT_REPORT_PRINT_THEME.note,
    primarySoft: brand.colors.accent,
  };
  const context: RenderContext = {
    tabs: options.tabs,
    horizonDays: options.horizonDays,
    dashboard: options.dashboard,
  };

  const blocks = withReportPrintTheme(theme, () => options.cards
    .map((card, index) => {
      const body = cardBodyHtml(card, context);
      const isTable = card.type === 'table';
      return `<section class="card ${isTable ? 'card-full' : 'card-half'}">
        <h2>${index + 1}. ${escapeHtml(card.title)}</h2>
        ${body}
      </section>`;
    })
    .join(''));

  const notices = options.notices.length
    ? `<div class="notices">${options.notices
        .map((notice) => `<p>${escapeHtml(notice)}</p>`)
        .join('')}</div>`
    : '';

  // Deterministic light print theme; independent of the app theme.
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
${fontCss}
@page { size: 11in 8.5in; margin: 0.5in 0.5in 0.6in 0.5in; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: "Noto Sans", Arial, Helvetica, sans-serif;
  color: ${theme.ink};
  background: ${theme.background};
  font-size: 10pt;
}
header.report-header { border-bottom: 2px solid ${theme.primary}; padding-bottom: 8px; margin-bottom: 10px; }
header.report-header h1 { font-size: 18pt; margin: 0 0 2px 0; }
header.report-header .organization { color:${theme.primary}; font-size:8.5pt; font-weight:700; letter-spacing:.05em; text-transform:uppercase; }
header.report-header .meta { font-size: 9pt; color: ${theme.muted}; }
.notices { font-size: 8.5pt; color: ${theme.muted}; margin-bottom: 8px; }
.notices p { margin: 1px 0; }
.cards { display: flex; flex-wrap: wrap; gap: 12px; }
.card { border: 0.75pt solid ${theme.grid}; border-radius: 4px; padding: 10px 12px; break-inside: avoid; }
.card-half { flex: 0 0 calc(50% - 6px); }
.card-full { flex: 0 0 100%; break-inside: auto; }
.card h2 { font-size: 11pt; margin: 0 0 8px 0; }
.kpi-grid { display: flex; flex-wrap: wrap; gap: 10px; }
.kpi { flex: 1 1 40%; min-width: 120px; }
.kpi-label { font-size: 8.5pt; color: ${theme.muted}; }
.kpi-value { font-size: 15pt; font-weight: 700; }
.kpi-hint { font-size: 8pt; color: #777; }
table.data-table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
table.data-table thead { display: table-header-group; }
table.data-table th {
  text-align: left; border-bottom: 1pt solid ${theme.primary}; padding: 3px 6px;
  font-size: 8.5pt; background: ${theme.primarySoft};
}
table.data-table td { border-bottom: 0.5pt solid ${theme.grid}; padding: 3px 6px; }
table.data-table tr { break-inside: avoid; }
table.data-table td.empty { color: #777; text-align: center; padding: 10px; }
svg { max-width: 100%; }
</style>
</head>
<body>
<header class="report-header">
  <div class="organization">${escapeHtml(brand.config.identity.organizationName)}</div>
  <h1>${escapeHtml(options.title)}</h1>
  <div class="meta">
    ${escapeHtml(options.rangeLabel)} · ${escapeHtml(options.timeZone)} ·
    ${options.horizonDays}-day planning horizon · ${escapeHtml(options.filtersSummary)} ·
    data as of ${escapeHtml(options.dataAsOf)}
  </div>
</header>
${notices}
<div class="cards">
${blocks}
</div>
</body>
</html>`;
}

export async function renderReportPdf(
  options: ReportPdfOptions
): Promise<Buffer> {
  const html = await renderReportPdfHtml(options);
  return renderHtmlToPdf(html, {
    width: '11in',
    height: '8.5in',
    // @page rules own the inner margins; the footer needs real margin space.
    margin: { top: '0in', right: '0in', bottom: '0in', left: '0in' },
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: `
      <div style="width:100%; font-size:8px; font-family: Arial, sans-serif; color:#555; text-align:center; padding-bottom:8px;">
        <span>${escapeHtml(options.title)} — Page </span>
        <span class="pageNumber"></span><span> of </span><span class="totalPages"></span>
      </div>`,
  });
}
