// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { BaseApiService } from '@/services/base';
import type {
  DataShapingCatalogEntry,
  DataShapingRule,
  DataShapingRuleInput,
  LegacyImportResult,
  ProcurementDataStatus,
  ProcurementAnalytics,
  ProcurementAnalyticsFilters,
  ProcurementImportRecord,
  UnifiedImportResult,
} from '@/types/procurement';

class ProcurementApiService extends BaseApiService {
  constructor() {
    super('/api/procurement');
  }

  async getImports(): Promise<ProcurementImportRecord[]> {
    const response = await this.get<{ imports: ProcurementImportRecord[] }>('/imports');
    return response.imports;
  }

  async getStatus(): Promise<ProcurementDataStatus> {
    const response = await this.get<{ status: ProcurementDataStatus }>('/status');
    return response.status;
  }

  async getAnalytics(filters: ProcurementAnalyticsFilters = {}): Promise<ProcurementAnalytics> {
    const params = new URLSearchParams();
    if (filters.preset) params.set('preset', filters.preset);
    if (filters.startDate) params.set('startDate', filters.startDate);
    if (filters.endDate) params.set('endDate', filters.endDate);
    if (filters.channel) params.set('channel', filters.channel);
    if (filters.acquisitionClass) params.set('acquisitionClass', filters.acquisitionClass);
    const query = params.size > 0 ? `?${params.toString()}` : '';
    const response = await this.get<{ analytics: ProcurementAnalytics }>(`/analytics${query}`);
    return response.analytics;
  }

  /** FEED accepts the unified OFB export -- one file covering Warehouse
   *  Completed orders plus Fresh Alliance Pending and Completed pickups. */
  async importOfbExport(file: File): Promise<UnifiedImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await this.requestFormData<{ result: UnifiedImportResult }>(
      '/imports',
      formData
    );
    return response.result;
  }

  /**
   * The legacy sidecar (D22). A separate endpoint from the OFB drop-zone on
   * purpose: it accepts only the curated community-donation ledger and teaches
   * the system nothing general.
   */
  async importLegacyLedger(file: File): Promise<LegacyImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await this.requestFormData<{ result: LegacyImportResult }>(
      '/imports/legacy',
      formData
    );
    return response.result;
  }

  async rollbackImports(ids: number[]): Promise<number> {
    const response = await this.post<{ result: { updated: number } }>(
      '/imports/rollback',
      { ids }
    );
    return response.result.updated;
  }

  async restoreImports(ids: number[]): Promise<number> {
    const response = await this.post<{ result: { updated: number } }>(
      '/imports/restore',
      { ids }
    );
    return response.result.updated;
  }

  /**
   * Data-shaping rules (D20). The catalog travels with the list so the options
   * staff see are the ones the evaluator understands -- no second, drifting
   * copy of the flag vocabulary in the frontend.
   */
  async getRules(): Promise<{ rules: DataShapingRule[]; catalog: DataShapingCatalogEntry[] }> {
    return this.get<{ rules: DataShapingRule[]; catalog: DataShapingCatalogEntry[] }>('/rules');
  }

  async createRule(input: DataShapingRuleInput): Promise<DataShapingRule> {
    const response = await this.post<{ rule: DataShapingRule }>('/rules', input);
    return response.rule;
  }

  async updateRule(id: number, input: Partial<DataShapingRuleInput>): Promise<DataShapingRule> {
    const response = await this.put<{ rule: DataShapingRule }>(`/rules/${id}`, input);
    return response.rule;
  }

  async deleteRule(id: number): Promise<void> {
    await this.delete<void>(`/rules/${id}`);
  }
}

export const procurementService = new ProcurementApiService();
