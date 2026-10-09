// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { BaseApiService } from '@/services/base';

export type DeploymentSettings = {
  publicInventoryEnabled: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
};

class DeploymentSettingsService extends BaseApiService {
  constructor() {
    super('/api');
  }

  // Routes return enveloped objects; unwrap here so callers see the value
  // rather than the envelope (AGENTS.md — API response envelopes).
  async load(): Promise<DeploymentSettings> {
    const response = await this.request<{ settings: DeploymentSettings }>(
      '/admin/deployment-settings',
    );
    return response.settings;
  }

  async update(
    changes: Partial<Pick<DeploymentSettings, 'publicInventoryEnabled'>>,
  ): Promise<DeploymentSettings> {
    const response = await this.request<{ settings: DeploymentSettings }>(
      '/admin/deployment-settings',
      { method: 'PUT', body: JSON.stringify(changes) },
    );
    return response.settings;
  }
}

export const deploymentSettingsService = new DeploymentSettingsService();
