// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { BaseApiService } from '../base';
import {
  ReportsExportRequest,
  ReportsQueryRequest,
  ReportsQueryResponse,
  ReportTabId,
  ReportTemplate,
  ReportTemplateData,
  DashboardSnapshot,
} from '@/types/reports';

export class ReportsService extends BaseApiService {
  constructor() {
    super('/api/reports');
  }

  async queryDashboard(
    request: ReportsQueryRequest & { source: 'dashboard' }
  ): Promise<{ source: 'dashboard'; result: DashboardSnapshot }> {
    try {
      return await this.post<{ source: 'dashboard'; result: DashboardSnapshot }>(
        '/query',
        request
      );
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /** Interactive query powering the Reports workspace tabs. */
  async query<T extends ReportTabId>(
    request: ReportsQueryRequest & { tab: T }
  ): Promise<ReportsQueryResponse<T>> {
    try {
      return await this.post<ReportsQueryResponse<T>>('/query', request);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Downloads one card's CSV (the quick per-card export outside selection
   * mode). Uses the shared authenticated binary path, honors the server's
   * RFC 6266 filename, and cleans up the object URL after the download.
   */
  async downloadCardCsv(
    cardId: string,
    request: ReportsQueryRequest
  ): Promise<void> {
    const { blob, filename } = await this.requestBinary(
      `/cards/${encodeURIComponent(cardId)}/csv`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      }
    );
    this.triggerDownload(blob, filename ?? `${cardId}.csv`);
  }

  /**
   * Generates the report ZIP (landscape PDF + numbered per-card CSVs +
   * manifest) from the current selection and downloads it.
   */
  async downloadExportZip(request: ReportsExportRequest): Promise<void> {
    const { blob, filename } = await this.requestBinary('/export', {
      method: 'POST',
      body: JSON.stringify(request),
    });
    this.triggerDownload(blob, filename ?? 'report.zip');
  }

  private triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // ---- Shared templates (organization-wide) --------------------------------

  async getTemplates(): Promise<ReportTemplate[]> {
    const response = await this.get<{ templates: ReportTemplate[] }>('/templates');
    return response.templates ?? [];
  }

  /** Create-or-update by normalized name within the template's source. */
  async saveTemplate(
    name: string,
    templateData: ReportTemplateData
  ): Promise<ReportTemplate> {
    const response = await this.post<{ template: ReportTemplate }>('/templates', {
      name,
      templateData,
    });
    return response.template;
  }

  async updateTemplate(
    id: number,
    updates: { name?: string; templateData?: ReportTemplateData }
  ): Promise<ReportTemplate> {
    const response = await this.put<{ template: ReportTemplate }>(
      `/templates/${id}`,
      updates
    );
    return response.template;
  }

  async deleteTemplate(id: number): Promise<void> {
    await this.delete(`/templates/${id}`);
  }
}

export const reportsService = new ReportsService();
