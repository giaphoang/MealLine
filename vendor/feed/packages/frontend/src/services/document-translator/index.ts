// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Document } from '@/components/document-translator/types';
import { BaseApiService } from '../base';
import config from '@/config/config';

export interface TranslationProgress {
  documentId: number;
  language: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  message?: string;
  stats?: {
    total: number;
    cached: number;
    newTranslations: number;
    failed?: number;
  };
  warnings?: string[]; // Parameter override warnings (e.g., GPT-5 temperature/top_p)
}

export interface Translation {
  id: number;
  fileName: string;
  language: string;
  createdAt: string;
  fileSize: string;
  cachedTranslationsCount?: number;
}

class DocumentApiService extends BaseApiService {
  // Track active translation requests to prevent duplicates
  private activeTranslations = new Map<string, Promise<any>>();

  constructor() {
    super('/api/documents');
  }
  
  // Get all documents
  async getAll(): Promise<Document[]> {
    try {
      const data = await this.get<any[]>('');
      
      // Transform to match our Document interface
      return data.map((document: any) => ({
        id: document.id,
        name: document.name,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
        fileSize: document.fileSize,
        type: 'original',
        hasIntegrityIssue: document.hasIntegrityIssue || false,
        wasCleared: document.wasCleared || false
      }));
    } catch (error) {
      console.error('Error fetching documents:', error);
      throw error;
    }
  }
  
  // Get document by ID
  async getById(id: number): Promise<Document> {
    try {
      const data = await this.get<any>(`/${id}`);
      
      return {
        id: data.id,
        name: data.name,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        fileSize: data.fileSize,
        type: 'original'
      };
    } catch (error) {
      console.error('Error fetching document:', error);
      throw error;
    }
  }
  
  // Create a new document
  async create(name: string): Promise<Document> {
    try {
      const data = await this.post<any>('', { name });
      
      return {
        id: data.id,
        name: data.name,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        fileSize: data.fileSize,
        type: 'original'
      };
    } catch (error) {
      console.error('Error creating document:', error);
      throw error;
    }
  }
  
  // Upload through the shared authenticated multipart path. The backend keeps
  // DOCX files in storage; transient data imports use the same transport but
  // deliberately discard their source buffers after normalization.
  async upload(file: File, name: string): Promise<Document> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (name) {
        formData.append('name', name);
      }
      const data = await this.requestFormData<any>('/upload', formData);
      
      return {
        ...data,
        type: 'original'
      };
    } catch (error) {
      console.error('Error uploading document:', error);
      throw error;
    }
  }
  
  // Download a document
  async download(id: number): Promise<void> {
    // Store a reference to the global document object
    const documentObj = document;
    try {
      // First get the document data to have its name as fallback
      const documentData = await this.getById(id);
      
      console.log("Downloading document:", documentData);
      
      // Use fetch for binary data with credentials
      const response = await fetch(`${this.baseUrl}/${id}/download`, {
        headers: this.getHeaders(),
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorMessage = await this.parseErrorResponse(response);
        throw new Error(errorMessage);
      }
      
      // Get filename from Content-Disposition header or use a default name
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `${documentData.name || 'document'}.docx`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) {
          filename = match[1];
        }
      }
      
      console.log("Downloading with filename:", filename);
      
      // Create a blob from the response and download it
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      // Use our stored reference to the document object to avoid any scope issues
      const a = documentObj.createElement('a');
      a.href = url;
      a.download = filename;
      documentObj.body.appendChild(a);
      a.click();
      documentObj.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading document:', error);
      throw error;
    }
  }
  
  // Delete a document
  async deleteDocument(id: number, preserveTranslations: boolean = false): Promise<void> {
    const queryParam = preserveTranslations ? '?preserveTranslations=true' : '';
    await this.delete(`/${id}${queryParam}`);
  }
  
  // Update a document
  async update(id: number, name: string): Promise<Document> {
    try {
      const data = await this.put<any>(`/${id}`, { name });
      
      return {
        id: data.id,
        name: data.name,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        type: 'original'
      };
    } catch (error) {
      console.error('Error updating document:', error);
      throw error;
    }
  }
  
  // Bulk delete documents
  async bulkDeleteDocuments(ids: number[], preserveTranslations: boolean = false): Promise<{ success: number; failed: number; errors: string[] }> {
    return this.post('/bulk-delete', { ids, preserveTranslations });
  }

  // Extract segments from document for advanced translation mode
  async extractSegments(id: number, languages?: string[]): Promise<{ segments: any[], segmentInstances: Record<string, any[]>, metadata: any }> {
    try {
      const queryParams = languages && languages.length > 0 ? `?languages=${languages.join(',')}` : '';
      return await this.get<{ segments: any[], segmentInstances: Record<string, any[]>, metadata: any }>(`/${id}/segments${queryParams}`);
    } catch (error) {
      console.error('Error extracting segments:', error);
      throw error;
    }
  }

  // Translate a document to specified languages
  async translateDocument(id: number, languages: string[], options?: { includeOriginalText?: boolean; segmentOptions?: { skipSegments: string[]; includeEnglishSegments: string[]; bypassCache?: string[] }; overwrite?: boolean }): Promise<{ message: string, documentId: number, languages: string[] }> {
    // Create a unique key for this translation request
    // Sort languages to ensure consistent key regardless of order
    const sortedLanguages = [...languages].sort();
    const optionsKey = JSON.stringify({
      includeOriginalText: options?.includeOriginalText || false,
      segmentOptions: options?.segmentOptions,
      overwrite: options?.overwrite || false
    });
    const translationKey = `${id}-${sortedLanguages.join(',')}-${optionsKey}`;
    
    // Check if this exact translation request is already in progress
    if (this.activeTranslations.has(translationKey)) {
      console.log(`Duplicate translation request detected for document ${id}, languages: ${sortedLanguages.join(', ')}. Returning existing promise.`);
      return this.activeTranslations.get(translationKey)!;
    }
    
    // Create and track the translation promise
    const translationPromise = this.post<any>(`/${id}/translate`, { 
      languages,
      includeOriginalText: options?.includeOriginalText || false,
      segmentOptions: options?.segmentOptions,
      overwrite: options?.overwrite || false
    }).finally(() => {
      // Clean up tracking when request completes (success or failure)
      this.activeTranslations.delete(translationKey);
      console.log(`Translation request completed for document ${id}, languages: ${sortedLanguages.join(', ')}. Cleaned up tracking.`);
    });
    
    // Store the promise for deduplication
    this.activeTranslations.set(translationKey, translationPromise);
    console.log(`Started new translation request for document ${id}, languages: ${sortedLanguages.join(', ')}.`);
    
    try {
      return await translationPromise;
    } catch (error) {
      console.error('Error translating document:', error);
      throw error;
    }
  }

  // Get translation progress
  async getTranslationProgress(id: number, language: string): Promise<TranslationProgress> {
    try {
      return await this.get<TranslationProgress>(`/${id}/translate/progress?language=${language}`);
    } catch (error) {
      console.error('Error getting translation progress:', error);
      throw error;
    }
  }

  // Get all translations for a document
  async getTranslations(id: number): Promise<Translation[]> {
    try {
      return await this.get<Translation[]>(`/${id}/translations`);
    } catch (error) {
      console.error('Error getting translations:', error);
      throw error;
    }
  }
  
  // Get cached translation counts for a document
  async getCachedTranslationsCount(id: number, language?: string): Promise<number> {
    try {
      const queryParam = language ? `?language=${encodeURIComponent(language)}` : '';
      const response = await this.get<{count: number}>(`/${id}/cached-translations/count${queryParam}`);
      return response.count;
    } catch (error) {
      console.error('Error getting cached translation count:', error);
      return 0; // Return 0 if there's an error
    }
  }

  // Download a translated document
  async downloadTranslation(id: number, language: string): Promise<void> {
    // Store a reference to the global document object
    const documentObj = document;
    try {
      console.log(`Downloading translation for document ${id}, language ${language}`);
      
      // 1. First attempt to get the translation metadata to get the correct filename
      const translations = await this.getTranslations(id);
      const translation = translations.find(t => t.language === language);
      const expectedFilename = translation?.fileName || `translated_document_${language}.docx`;
      console.log(`Expected filename from translation metadata: ${expectedFilename}`);
      
      // 2. Fetch the actual file content with credentials
      const response = await fetch(`${this.baseUrl}/${id}/translations/${language}/download`, {
        headers: this.getHeaders(),
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorMessage = await this.parseErrorResponse(response);
        throw new Error(errorMessage);
      }
      
      // 3. Get filename from Content-Disposition header as a secondary option
      const contentDisposition = response.headers.get('Content-Disposition');
      console.log(`Content-Disposition header: ${contentDisposition}`);
      
      let filename = expectedFilename; // Start with our expected filename from metadata
      
      // 4. Parse Content-Disposition header if it exists (as a backup verification)
      if (contentDisposition) {
        // First try RFC 6266 format with filename* parameter
        let match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/);
        if (match && match[1]) {
          const headerFilename = decodeURIComponent(match[1]);
          console.log(`Extracted filename from filename* parameter: ${headerFilename}`);
          // Only use this if it seems valid (not empty, has .docx extension)
          if (headerFilename && headerFilename.toLowerCase().endsWith('.docx')) {
            filename = headerFilename;
          }
        } else {
          // Try the standard filename parameter with or without quotes
          match = contentDisposition.match(/filename="?([^";\r\n]+)"?/);
          if (match && match[1]) {
            const headerFilename = match[1].trim();
            console.log(`Extracted filename from standard parameter: ${headerFilename}`);
            // Only use this if it seems valid
            if (headerFilename && headerFilename.toLowerCase().endsWith('.docx')) {
              filename = headerFilename;
            }
          }
        }
      }
      
      // 5. Remove any quotes that might still be present
      filename = filename.replace(/^"|"$/g, '');
      
      console.log(`Using filename for download: ${filename}`);
      
      // 6. Create a blob from the response and download it
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      // Use our stored reference to the document object to avoid any scope issues
      const a = documentObj.createElement('a');
      a.href = url;
      a.download = filename;
      documentObj.body.appendChild(a);
      a.click();
      documentObj.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading translation:', error);
      throw error;
    }
  }
  
  // Delete a translation
  async deleteTranslation(documentId: number, language: string, preserveTranslations: boolean = false): Promise<void> {
    try {
      // Add query parameter for preserveTranslations
      const queryParam = preserveTranslations ? '?preserveTranslations=true' : '';
      // Use explicit DELETE verb instead of this.delete to avoid naming conflict
      await fetch(`${this.baseUrl}/${documentId}/translations/${language}${queryParam}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
        credentials: 'include'
      });
    } catch (error) {
      console.error('Error deleting translation:', error);
      throw error;
    }
  }

  // Optimized classification method for Phase 2
  async classifySegmentsOptimized(id: number, segmentMap: Record<string, string[]>, extractionSessionId: string): Promise<{
    decisions: Record<string, 'skip' | 'include' | 'normal'>;
    appliedConfig: string;
    processingTime: number;
    cacheStats?: {
      totalSegments: number;
      cachedSegments: number;
      newClassifications: number;
      cacheHitRate: number;
    };
  }> {
    try {
      return await this.post<any>(`/${id}/classify-optimized`, { 
        segmentMap,
        extractionSessionId
      });
    } catch (error) {
      console.error('Error in optimized classification:', error);
      throw error;
    }
  }

  // Get system prompts using BaseApiService infrastructure
  private async getSystemPrompts(): Promise<any[]> {
    // Use a separate BaseApiService instance for system prompts API
    const systemPromptsService = new (class extends BaseApiService {
      constructor() {
        super('/api/system-prompts');
      }

      public async getPrompts(): Promise<any[]> {
        const response = await this.get<{ prompts: any[] }>('');
        return response.prompts || [];
      }
    })();
    
    return systemPromptsService.getPrompts();
  }

  // Save manual formatting choices
  async saveManualFormattingChoices(
    documentId: number, 
    manualChoices: Array<{ originalText: string; classificationAction: 'skip' | 'include' | 'normal' }>
  ): Promise<{ message: string; cacheStats: any }> {
    try {
      // Get active CLASSIFICATION prompt ID from system prompts using BaseApiService
      const systemPrompts = await this.getSystemPrompts();
      
      const activePrompt = systemPrompts.find((prompt: any) => 
        prompt.promptType === 'CLASSIFICATION' && prompt.isActive
      );
      
      if (!activePrompt) {
        throw new Error('No active CLASSIFICATION prompt found');
      }
      
      return await this.post<any>(`/${documentId}/save-manual-formatting`, {
        manualChoices,
        systemPromptId: activePrompt.id
      });
    } catch (error) {
      console.error('Error saving manual formatting choices:', error);
      throw error;
    }
  }
}

// Create and export a singleton instance
export const DocumentService = new DocumentApiService();
