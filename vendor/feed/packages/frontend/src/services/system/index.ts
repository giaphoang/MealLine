// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { BaseApiService } from '@/services/base';
import config from '@/config/config';

export interface SystemStartupStatus {
  isStartupCondition: boolean;
  hasFoundationalData: boolean;
  hasUsageData: boolean;
  foundationalDataCounts: {
    categories: number;
    foodItems: number;
    languages: number;
  };
  usageDataCounts: {
    apiUsageLogs: number;
    usageRecords: number;
  };
  systemState: 'startup' | 'operational' | 'error';
  description: string;
}

/**
 * Service for checking system startup status
 */
export class SystemStatusService extends BaseApiService {
  constructor() {
    super('/api/system');
  }

  /**
   * Get system startup status to distinguish between startup conditions and actual errors
   */
  async getStartupStatus(): Promise<SystemStartupStatus> {
    return await this.get<SystemStartupStatus>('/startup-status');
  }
}

export const systemStatusService = new SystemStatusService();
