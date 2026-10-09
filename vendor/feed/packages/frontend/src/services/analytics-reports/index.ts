// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { BaseApiService } from '../base';

/**
 * Report generation for the Analytics lenses.
 *
 * Separate from `ReportsService`, which speaks to the operational workspace and
 * carries the dormant registry's vocabulary (`horizonDays`, `cardOptions`,
 * `source`). None of that applies here: an Analytics report is a selection of
 * cards plus the filters the page is already showing.
 */

export interface AnalyticsReportRequest {
  /** Ordered — selection order is the report's order. */
  cardIds: string[];
  title: string;
  includePdf: boolean;
  includeCsv: boolean;
  csvGrain: 'condensed' | 'raw';
  /** Per-card controls, frozen when selection began. */
  cardOptions?: Record<string, unknown>;
  preset: string;
  startDate?: string;
  endDate?: string;
  channel?: 'ofb_warehouse' | 'fresh_alliance';
  acquisitionClass?: 'DONATED' | 'PURCH-DON' | 'GOVERNMENT' | 'PURCHASED';
}

export interface AnalyticsReportCard {
  id: string;
  title: string;
  lens: 'operations' | 'procurement' | 'service' | 'clients';
  kind: 'chart' | 'kpi' | 'table';
}

export interface AnalyticsTemplateRequest {
  name: string;
  cardIds: string[];
  channel?: 'ofb_warehouse' | 'fresh_alliance';
  acquisitionClass?: 'DONATED' | 'PURCH-DON' | 'GOVERNMENT' | 'PURCHASED';
  includePdf: boolean;
  includeCsv: boolean;
  csvGrain: 'condensed' | 'raw';
  cardOptions?: Record<string, unknown>;
}

/** A saved template as stored. `templateData` is JSON written by the client. */
export interface AnalyticsReportTemplate {
  id: number;
  name: string;
  source: string;
  templateData: unknown;
  createdAt: string;
  updatedAt: string;
}

export class AnalyticsReportsService extends BaseApiService {
  constructor() {
    super('/api/analytics-reports');
  }

  /** Which cards the server can render. The client offers only these. */
  async getCards(): Promise<AnalyticsReportCard[]> {
    const response = await this.get<{ cards: AnalyticsReportCard[] }>('/cards');
    return response.cards;
  }

  /**
   * Saves the selection as a reusable template.
   *
   * The date range is deliberately not stored — a template is a shape, and the
   * range is chosen when it is run from Reports.
   */
  async saveTemplate(request: AnalyticsTemplateRequest): Promise<void> {
    await this.post('/templates', request);
  }

  /** Saved templates, newest first. */
  async getTemplates(): Promise<AnalyticsReportTemplate[]> {
    const response = await this.get<{ templates: AnalyticsReportTemplate[] }>('/templates');
    return response.templates;
  }

  async deleteTemplate(id: number): Promise<void> {
    await this.delete(`/templates/${id}`);
  }

  /** Delete one Reports Management table selection as one operation. */
  async deleteTemplates(ids: number[]): Promise<{ deleted: number }> {
    return this.delete<{ deleted: number }>('/templates/bulk', { ids });
  }

  /** Generates the ZIP (PDF + numbered per-card CSVs + manifest) and downloads it. */
  async downloadReport(request: AnalyticsReportRequest): Promise<void> {
    const { blob, filename } = await this.requestBinary('/export', {
      method: 'POST',
      body: JSON.stringify(request),
    });

    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename ?? 'feed-report.zip';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export const analyticsReportsService = new AnalyticsReportsService();
