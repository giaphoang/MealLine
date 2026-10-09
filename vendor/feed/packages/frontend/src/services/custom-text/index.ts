// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { BaseApiService } from '../base';
import config from '@/config/config';

export interface CustomText {
  id: number;
  text: string;
  isTitle: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomTextCreate {
  text: string;
  isTitle: boolean;
}

export interface CustomTextUpdate {
  text?: string;
  isTitle?: boolean;
}

class CustomTextService extends BaseApiService {
  constructor() {
    super(config.api.endpoints.customTexts.base);
  }

  // Get all custom texts
  async getCustomTexts(): Promise<CustomText[]> {
    try {
      return await this.get<CustomText[]>();
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Get custom text by ID
  async getCustomTextById(id: number): Promise<CustomText> {
    try {
      return await this.get<CustomText>(`/${id}`);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Create new custom text
  async createCustomText(data: CustomTextCreate): Promise<CustomText> {
    try {
      return await this.post<CustomText>('', data);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Update custom text
  async updateCustomText(id: number, data: CustomTextUpdate): Promise<CustomText> {
    try {
      return await this.put<CustomText>(`/${id}`, data);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Delete custom text
  async deleteCustomText(id: number): Promise<void> {
    try {
      await this.delete(`/${id}`);
    } catch (error) {
      throw this.handleError(error);
    }
  }
}

export default new CustomTextService();