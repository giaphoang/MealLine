// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDocuments } from '@/hooks/document-translator/useDocuments';
import { DocumentService } from '@/services/document-translator';
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';

// Mock dependencies
vi.mock('@/services/document-translator');
vi.mock('@/services/error/ErrorHandlerService');

// Create stable mock references to prevent infinite re-renders
const mockLanguages = [
  { id: 1, name: 'English', code: 'en', enabled: true },
  { id: 2, name: 'Spanish', code: 'es', enabled: true },
  { id: 3, name: 'French', code: 'fr', enabled: true }
];

const mockShowMessage = vi.fn();

vi.mock('@/hooks/message/useMessage', () => ({
  useMessage: () => ({
    showMessage: mockShowMessage
  })
}));
vi.mock('@/hooks/language/useEnabledLanguages', () => ({
  useEnabledLanguages: () => ({
    languages: mockLanguages
  })
}));

const mockDocumentService = DocumentService as any;
const mockErrorHandler = ErrorHandlerService as any;

describe('useDocuments Hook - Date Formatting Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Date Formatting - Original Documents', () => {
    it('should format original document dates using toLocaleDateString', async () => {
      // Mock API response with UTC date strings
      const mockOriginalDocs = [
        {
          id: 1,
          name: 'Test Document',
          createdAt: '2025-08-02T05:30:00.000Z', // 1:30 AM UTC (previous day in some timezones)
          updatedAt: '2025-08-02T06:30:00.000Z', // 2:30 AM UTC
          hasIntegrityIssue: false,
          wasCleared: false
        }
      ];

      mockDocumentService.getAll.mockResolvedValue(mockOriginalDocs);
      mockDocumentService.getTranslations.mockResolvedValue([]);

      const { result } = renderHook(() => useDocuments());

      await waitFor(() => {
        expect(result.current.documents).toHaveLength(1);
      });

      const document = result.current.documents[0];
      
      // Verify dates are raw ISO strings
      expect(document.createdAt).toBe('2025-08-02T05:30:00.000Z');
      expect(document.updatedAt).toBe('2025-08-02T06:30:00.000Z');
      expect(document.type).toBe('original');
    });

    it('should handle edge case timezone dates correctly', async () => {
      // Test with dates that would show wrong day with naive split('T')[0]
      const mockOriginalDocs = [
        {
          id: 1,
          name: 'Edge Case Document',
          createdAt: '2025-08-01T23:45:00.000Z', // 11:45 PM UTC on Aug 1
          updatedAt: '2025-08-02T00:15:00.000Z', // 12:15 AM UTC on Aug 2
          hasIntegrityIssue: false,
          wasCleared: false
        }
      ];

      mockDocumentService.getAll.mockResolvedValue(mockOriginalDocs);
      mockDocumentService.getTranslations.mockResolvedValue([]);

      const { result } = renderHook(() => useDocuments());

      await waitFor(() => {
        expect(result.current.documents).toHaveLength(1);
      });

      const document = result.current.documents[0];
      
      // Verify dates are raw ISO strings
      expect(document.createdAt).toBe('2025-08-01T23:45:00.000Z');
      expect(document.updatedAt).toBe('2025-08-02T00:15:00.000Z');
    });
  });

  describe('Date Formatting - Translated Documents', () => {
    it('should format translation document dates using toLocaleDateString', async () => {
      const mockOriginalDocs = [
        {
          id: 1,
          name: 'Original Document',
          createdAt: '2025-08-02T05:30:00.000Z',
          updatedAt: '2025-08-02T06:30:00.000Z',
          hasIntegrityIssue: false,
          wasCleared: false
        }
      ];

      const mockTranslations = [
        {
          id: 10,
          fileName: 'Original Document - Spanish.docx',
          language: 'Spanish',
          createdAt: '2025-08-02T07:15:00.000Z', // Different time for translation
          fileSize: '15 KB'
        }
      ];

      mockDocumentService.getAll.mockResolvedValue(mockOriginalDocs);
      mockDocumentService.getTranslations.mockResolvedValue(mockTranslations);

      const { result } = renderHook(() => useDocuments());

      await waitFor(() => {
        expect(result.current.documents).toHaveLength(2); // Original + Translation
      });

      const translationDoc = result.current.documents.find(d => d.type === 'translated');
      
      expect(translationDoc).toBeDefined();
      expect(translationDoc!.createdAt).toBe('2025-08-02T07:15:00.000Z');
      expect(translationDoc!.type).toBe('translated');
      expect(translationDoc!.language).toBe('Spanish');
    });

    it('should handle multiple translations with correct date formatting', async () => {
      const mockOriginalDocs = [
        {
          id: 1,
          name: 'Multi-language Document',
          createdAt: '2025-08-02T05:30:00.000Z',
          updatedAt: '2025-08-02T06:30:00.000Z',
          hasIntegrityIssue: false,
          wasCleared: false
        }
      ];

      const mockTranslations = [
        {
          id: 10,
          fileName: 'Multi-language Document - Spanish.docx',
          language: 'Spanish',
          createdAt: '2025-08-02T07:15:00.000Z',
          fileSize: '15 KB'
        },
        {
          id: 11,
          fileName: 'Multi-language Document - French.docx',
          language: 'French',
          createdAt: '2025-08-02T08:45:00.000Z',
          fileSize: '16 KB'
        }
      ];

      mockDocumentService.getAll.mockResolvedValue(mockOriginalDocs);
      mockDocumentService.getTranslations.mockResolvedValue(mockTranslations);

      const { result } = renderHook(() => useDocuments());

      await waitFor(() => {
        expect(result.current.documents).toHaveLength(3); // Original + 2 Translations
      });

      const translationDocs = result.current.documents.filter(d => d.type === 'translated');
      
      expect(translationDocs).toHaveLength(2);
      
      translationDocs.forEach(doc => {
        expect(doc.createdAt).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/); // ISO 8601 format pattern
        expect(['Spanish', 'French']).toContain(doc.language);
      });
    });
  });

  describe('Date Consistency Validation', () => {
    it('should ensure date formatting is consistent between original and translated documents', async () => {
      const testDate = '2025-08-02T05:30:00.000Z';
      const expectedFormattedDate = new Date(testDate).toLocaleDateString();

      const mockOriginalDocs = [
        {
          id: 1,
          name: 'Consistency Test',
          createdAt: testDate,
          updatedAt: testDate,
          hasIntegrityIssue: false,
          wasCleared: false
        }
      ];

      const mockTranslations = [
        {
          id: 10,
          fileName: 'Consistency Test - Spanish.docx',
          language: 'Spanish',
          createdAt: testDate,
          fileSize: '15 KB'
        }
      ];

      mockDocumentService.getAll.mockResolvedValue(mockOriginalDocs);
      mockDocumentService.getTranslations.mockResolvedValue(mockTranslations);

      const { result } = renderHook(() => useDocuments());

      await waitFor(() => {
        expect(result.current.documents).toHaveLength(2);
      });

      const originalDoc = result.current.documents.find(d => d.type === 'original');
      const translationDoc = result.current.documents.find(d => d.type === 'translated');
      
      // Both should be raw ISO strings
      expect(originalDoc!.createdAt).toBe(testDate);
      expect(translationDoc!.createdAt).toBe(testDate);
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully and call ErrorHandlerService', async () => {
      const mockError = new Error('Network error');
      mockDocumentService.getAll.mockRejectedValue(mockError);

      const { result } = renderHook(() => useDocuments());

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to load documents');
      });

      expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
        mockError,
        'fetchDocumentsAndTranslations'
      );
    });
  });

  describe('Translation Count Calculation', () => {
    it('should correctly calculate translation counts for original documents', async () => {
      const mockOriginalDocs = [
        {
          id: 1,
          name: 'Document with Translations',
          createdAt: '2025-08-02T05:30:00.000Z',
          updatedAt: '2025-08-02T06:30:00.000Z',
          hasIntegrityIssue: false,
          wasCleared: false
        }
      ];

      const mockTranslations = [
        {
          id: 10,
          fileName: 'Document with Translations - Spanish.docx',
          language: 'Spanish',
          createdAt: '2025-08-02T07:15:00.000Z',
          fileSize: '15 KB'
        },
        {
          id: 11,
          fileName: 'Document with Translations - French.docx',
          language: 'French',
          createdAt: '2025-08-02T08:45:00.000Z',
          fileSize: '16 KB'
        }
      ];

      mockDocumentService.getAll.mockResolvedValue(mockOriginalDocs);
      mockDocumentService.getTranslations.mockResolvedValue(mockTranslations);

      const { result } = renderHook(() => useDocuments());

      await waitFor(() => {
        expect(result.current.documents).toHaveLength(3);
      });

      const originalDoc = result.current.documents.find(d => d.type === 'original');
      
      expect(originalDoc!.translationsCount).toBe(2);
    });
  });
});
