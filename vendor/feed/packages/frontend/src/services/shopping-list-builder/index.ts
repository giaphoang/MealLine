// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import config from '@/config/config';
import { BaseApiService } from '@/services/base';
import {
  BuilderComponent,
  BuilderPrintMode,
  InventorySectionComponent,
  SavedBuilderComponent,
  SavedBuilderTemplate,
  ShoppingListBuilderTemplate,
} from '@/components/shopping-lists/builder/types';
import { ExportSettings } from '@/components/shopping-lists/builder/export-filename';

class ShoppingListBuilderService extends BaseApiService {
  constructor() {
    super('/api/shopping-list-builder');
  }

  async getSavedComponents(): Promise<SavedBuilderComponent[]> {
    const response = await this.get<{ components: SavedBuilderComponent[] }>('/components');
    return response.components;
  }

  async createSavedComponent(name: string, component: BuilderComponent): Promise<SavedBuilderComponent> {
    const response = await this.post<{ component: SavedBuilderComponent }>('/components', { name, component });
    return response.component;
  }

  async updateSavedComponent(id: number, name: string, component: BuilderComponent): Promise<SavedBuilderComponent> {
    const response = await this.put<{ component: SavedBuilderComponent }>(`/components/${id}`, { name, component });
    return response.component;
  }

  async deleteSavedComponent(id: number): Promise<void> {
    await this.delete(`/components/${id}`);
  }

  async getSavedTemplates(): Promise<SavedBuilderTemplate[]> {
    const response = await this.get<{ templates: SavedBuilderTemplate[] }>('/templates');
    return response.templates;
  }

  async createSavedTemplate(name: string, template: ShoppingListBuilderTemplate): Promise<SavedBuilderTemplate> {
    const response = await this.post<{ template: SavedBuilderTemplate }>('/templates', { name, template });
    return response.template;
  }

  async updateSavedTemplate(id: number, name: string, template: ShoppingListBuilderTemplate): Promise<SavedBuilderTemplate> {
    const response = await this.put<{ template: SavedBuilderTemplate }>(`/templates/${id}`, { name, template });
    return response.template;
  }

  async deleteSavedTemplate(id: number): Promise<void> {
    await this.delete(`/templates/${id}`);
  }

  async refreshTemplateInventory(template: ShoppingListBuilderTemplate): Promise<ShoppingListBuilderTemplate> {
    const response = await this.post<{ template: ShoppingListBuilderTemplate }>('/refresh-inventory', { template });
    return response.template;
  }

  async updateInventoryItemLimit(foodItemId: number, limit: string | number | null): Promise<{
    foodItem: {
      id: number;
      name: string;
      limit: number;
      isLimited: boolean;
      effectiveLimit: string;
      limitSource: 'food-item' | 'category' | 'none';
    };
  }> {
    return this.put(`/inventory-items/${foodItemId}/limit`, { limit });
  }

  async getInventorySections(): Promise<InventorySectionComponent[]> {
    const response = await this.get<{ sections: InventorySectionComponent[] }>('/inventory-sections');
    return response.sections;
  }

  async createPreviewPdf(
    template: ShoppingListBuilderTemplate,
    options: { targetLanguage?: string; printMode?: BuilderPrintMode } = {},
  ): Promise<Blob> {
    // When `targetLanguage` is provided, the backend looks up cached
    // 'Generated (List)' translations and substitutes them into text
    // components before rendering. Missing translations silently fall back
    // to English -- the modal's pre-flight step is the place that warns
    // the user about gaps; the server never blocks generation.
    //
    // `printMode`, when provided, overrides `template.printMode` for this
    // render only -- used by the bulk translated-PDF export modal to opt
    // a single-sided saved template into `'two-sided-when-single-page'`
    // (which duplicates only when the planner produces 1 page).
    const body: {
      template: ShoppingListBuilderTemplate;
      targetLanguage?: string;
      printMode?: BuilderPrintMode;
    } = { template };
    if (options.targetLanguage && options.targetLanguage.trim().length > 0) {
      body.targetLanguage = options.targetLanguage.trim();
    }
    if (options.printMode) {
      body.printMode = options.printMode;
    }

    const response = await fetch(`${config.api.baseUrl}/api/shopping-list-builder/preview-pdf`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (response.status === 401) {
      window.location.href = `${import.meta.env.BASE_URL}login`;
      throw new Error('Your session has expired. Please log in again to continue.');
    }

    if (!response.ok) {
      const errorMessage = await this.parseErrorResponse(response);
      throw new Error(errorMessage);
    }

    return response.blob();
  }

  /**
   * Pre-flight check for translated PDF generation. Walks the template,
   * extracts translatable strings (text component content in Slice 1),
   * and reports which already have a cached 'Generated (List)' translation
   * vs which would need to be translated before rendering. Used by the
   * Translate & Generate modal step 2.
   */
  async translationPreflight(
    template: ShoppingListBuilderTemplate,
    targetLanguage: string,
  ): Promise<{
    totalStrings: number;
    cachedCount: number;
    missingStrings: string[];
    /**
     * Map of originalText -> translatedText for every cache hit. Used by
     * the builder's canvas language-preview to render text components in
     * a chosen target language without a second roundtrip. Empty when no
     * translatable strings exist or none are cached yet.
     */
    cached: Record<string, string>;
    inventory?: {
      categories: Record<number, string>;
      foodItems: Record<number, string>;
    };
  }> {
    return this.post('/translation-preflight', { template, targetLanguage });
  }

  /**
   * Synchronously translate a list of strings into the target language via
   * the existing AI translation primitive. Caches results in the
   * Translation table as 'Generated (List)' rows so subsequent renders can
   * read them directly. Used by the modal step 3 after pre-flight reports
   * missing translations.
   */
  async translateMissingStrings(
    strings: string[],
    targetLanguage: string,
  ): Promise<{ translations: Record<string, string> }> {
    return this.post('/translate-missing-strings', { strings, targetLanguage });
  }

  /**
   * B1 — fetch the org-wide shared Export Settings (filename configuration
   * for exported PDFs). The backend returns sensible defaults when no row
   * has been saved yet.
   */
  async getExportSettings(): Promise<ExportSettings> {
    const response = await this.get<{ settings: ExportSettings }>('/export-settings');
    return response.settings;
  }

  /** B1 — persist the org-wide shared Export Settings. */
  async updateExportSettings(settings: ExportSettings): Promise<ExportSettings> {
    const response = await this.put<{ settings: ExportSettings }>('/export-settings', settings);
    return response.settings;
  }
}

export const shoppingListBuilderService = new ShoppingListBuilderService();
