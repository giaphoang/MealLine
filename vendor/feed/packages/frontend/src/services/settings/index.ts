// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import config from '@/config/config';
import { BaseApiService } from '@/services/base';
import type { OperatingHoursSettings } from '@/types/settings';

class SettingsService extends BaseApiService {
  constructor() {
    super(config.api.endpoints.settings.base);
  }

  async getOperatingHours(): Promise<OperatingHoursSettings> {
    const response = await this.get<{ settings: OperatingHoursSettings }>(
      config.api.endpoints.settings.operatingHours
    );
    return response.settings;
  }

  async updateOperatingHours(
    settings: Pick<OperatingHoursSettings, 'timezone' | 'hours'>
  ): Promise<OperatingHoursSettings> {
    const response = await this.put<{ settings: OperatingHoursSettings }>(
      config.api.endpoints.settings.operatingHours,
      settings
    );
    return response.settings;
  }
}

export const settingsService = new SettingsService();
