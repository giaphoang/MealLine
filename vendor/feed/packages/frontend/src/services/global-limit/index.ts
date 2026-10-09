// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { BaseApiService } from '@/services/base';
import config from '@/config/config';

interface GlobalLimitResponse {
  success: boolean;
  data: {
    limit: number;
    timestamp?: string;
  };
}

export class GlobalLimitService extends BaseApiService {
  constructor() {
    super(config.api.endpoints.globalLimit);
  }

  /**
   * Get the current global limit
   * @returns Promise<number> Current global limit value
   */
  async getGlobalLimit(): Promise<number> {
    try {
      const response = await this.get<GlobalLimitResponse>();
      return response.data.limit;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Update the global limit
   * @param limit - New limit value (1-100)
   * @returns Promise<number> Updated global limit value
   */
  async updateGlobalLimit(limit: number): Promise<number> {
    if (limit < 1 || limit > 100 || !Number.isInteger(limit)) {
      throw new Error('Limit must be a whole number between 1 and 100');
    }

    try {
      const response = await this.put<GlobalLimitResponse>('', { limit });
      return response.data.limit;
    } catch (error) {
      throw this.handleError(error);
    }
  }
}