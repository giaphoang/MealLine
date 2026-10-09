// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { BaseApiService } from '@/services/base';
import type { BrandAssetReference, BrandConfigurationPayload } from '@/contexts/BrandContext';

export type BrandConfigurationRow = {
  id: string;
  payload: BrandConfigurationPayload;
  isActive: boolean;
  isTemplate: boolean;
  updatedAt: string;
};

export type PaletteEntry = {
  name: string;
  family: string;
  stop: number;
  color: string;
  neutral: boolean;
};

export type BrandPreview = {
  families: {
    accent: string; darkAccent: string; secondary: string; neutral: string;
    mudEscapedFrom: string | null;
  };
  alternates: { family: string; stop: number; distance: number; color: string }[];
  /** Each ranked brand colour and the Tailwind stop it snaps to. */
  hierarchy: {
    family: string;
    stop: number;
    name: string;
    color: string;
    requestedColor: string;
    distance: number;
    /** Neighbouring families at a similar colour, one stop each. */
    nearby: { name: string; family: string; stop: number; color: string; distance: number }[];
    /** Which part of the theme this rank drives, from the colour story. */
    role: 'primary' | 'accent' | 'ambient' | 'surface-dark' | 'surface-light' | null;
    roleLabel: string | null;
    roleWarning: string | null;
  }[];
  tokens: Record<'light' | 'dark', Record<string, string>>;
  chartOrder: string[];
  chartColors: Record<'light' | 'dark', string[]>;
};

export type BrandAssetStorageCheck = {
  totalCount: number;
  referencedCount: number;
  unusedCount: number;
  unusedBytes: number;
  protectedRecentCount: number;
  eligibleUnusedCount: number;
  eligibleUnusedBytes: number;
  eligibleUnusedAssets: Array<{
    id: string;
    filename: string;
    mimeType: string;
    width: number;
    height: number;
    byteSize: number;
    createdAt: string;
  }>;
};

class BrandService extends BaseApiService {
  constructor() {
    super('/api');
  }

  async list() {
    return this.request<{ configurations: BrandConfigurationRow[]; activeId: string | null }>('/admin/brand');
  }

  async save(id: string, payload: BrandConfigurationPayload, activate: boolean) {
    return this.request<{ configuration: BrandConfigurationRow }>(`/admin/brand/${encodeURIComponent(id)}`, {
      method: 'PUT', body: JSON.stringify({ payload, activate }),
    });
  }

  async preview(payload: BrandConfigurationPayload) {
    return this.request<{ preview: BrandPreview }>('/admin/brand/preview', {
      method: 'POST', body: JSON.stringify({ payload }),
    });
  }

  async activate(id: string) {
    return this.request(`/admin/brand/activate/${encodeURIComponent(id)}`, { method: 'POST' });
  }

  async deactivate() {
    return this.request('/admin/brand/deactivate', { method: 'POST' });
  }

  async remove(id: string) {
    return this.request(`/admin/brand/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async upload(kind: 'logo-light' | 'logo-dark' | 'square', file: File): Promise<{
    asset: BrandAssetReference;
    derivatives: BrandAssetReference[];
    warnings: string[];
    /** Present only for `logo-light`; see describeLogoPresentation. */
    presentation: {
      suggested: 'transparent' | 'dark-surface';
      transparentFraction: number;
      artworkLightness: number;
      reason: string;
    } | null;
  }> {
    const form = new FormData();
    form.set('kind', kind);
    form.set('file', file);
    return this.requestFormData<{
      asset: BrandAssetReference;
      derivatives: BrandAssetReference[];
      warnings: string[];
      presentation: {
        suggested: 'transparent' | 'dark-surface';
        transparentFraction: number;
        artworkLightness: number;
        reason: string;
      } | null;
    }>('/admin/brand/assets', form);
  }

  /** The Tailwind stops a brand colour may be. Immutable; fetched once. */
  async palette(): Promise<PaletteEntry[]> {
    const { palette } = await this.request<{ palette: PaletteEntry[] }>('/admin/brand/palette');
    return palette;
  }

  async checkAssetStorage() {
    return this.request<{ check: BrandAssetStorageCheck }>('/admin/brand/assets/storage-check');
  }

  async cleanupUnusedAssets() {
    return this.request<{
      cleanup: { deletedCount: number; deletedBytes: number; protectedRecentCount: number };
      check: BrandAssetStorageCheck;
    }>('/admin/brand/assets/unused', { method: 'DELETE' });
  }
}

export const brandService = new BrandService();
