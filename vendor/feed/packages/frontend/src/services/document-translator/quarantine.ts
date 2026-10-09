// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { BaseApiService } from '../base';

export interface QuarantinedFile {
  id: string;
  name: string;
  type: 'documents' | 'translations';
  size: number;
  createdAt: string;
}

export interface QuarantineResult {
  status: string;
  files: QuarantinedFile[];
  count: number;
}

/**
 * Service for handling quarantined files
 */
class QuarantineApiService extends BaseApiService {
  constructor() {
    super('/api/quarantine');
  }

  /**
   * Get list of quarantined files
   */
  async getQuarantinedFiles(): Promise<QuarantineResult> {
    try {
      return await this.get<QuarantineResult>('');
    } catch (error) {
      console.error('Error fetching quarantined files:', error);
      throw error;
    }
  }

  /**
   * Get download URL for a quarantined file
   * @param type File type (documents or translations)
   * @param id File ID
   */
  getDownloadUrl(type: string, id: string): string {
    return `${this.baseUrl}/${type}/${id}`;
  }

  /**
   * Delete a quarantined file
   * @param type File type (documents or translations)
   * @param id File ID
   */
  async deleteQuarantinedFile(type: string, id: string): Promise<{ status: string; message: string }> {
    try {
      return await this.delete<{ status: string; message: string }>(`/${type}/${id}`);
    } catch (error) {
      console.error('Error deleting quarantined file:', error);
      throw error;
    }
  }

  /**
   * Delete all quarantined files
   */
  async deleteAllQuarantinedFiles(): Promise<{ status: string; message: string; count: number }> {
    try {
      return await this.delete<{ status: string; message: string; count: number }>(`/all`);
    } catch (error) {
      console.error('Error deleting all quarantined files:', error);
      throw error;
    }
  }
}

export const QuarantineService = new QuarantineApiService();
