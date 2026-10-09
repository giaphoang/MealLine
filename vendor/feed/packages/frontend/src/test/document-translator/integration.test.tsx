// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DocumentTranslator } from '@/components/document-translator';
import { DocumentService } from '@/services/document-translator';

// Mock window.matchMedia for JSDOM
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock all dependencies
vi.mock('@/services/document-translator');
vi.mock('@/hooks/document-translator/useDocuments');
vi.mock('@/hooks/language/useEnabledLanguages');
vi.mock('@/hooks/message/useMessage');
vi.mock('@/hooks/dialog/useDialogState');

const mockDocumentService = DocumentService as any;

// Import the mocked hook
import { useDocuments } from '@/hooks/document-translator/useDocuments';
import { useEnabledLanguages } from '@/hooks/language/useEnabledLanguages';
import { useMessage } from '@/hooks/message/useMessage';
import { useDialogState } from '@/hooks/dialog/useDialogState';
import { formatDate } from '@/lib/formatting/date';

const mockUseDocuments = vi.mocked(useDocuments);
const mockUseEnabledLanguages = vi.mocked(useEnabledLanguages);
const mockUseMessage = vi.mocked(useMessage);
const mockUseDialogState = vi.mocked(useDialogState);

// Mock other hooks
mockUseEnabledLanguages.mockReturnValue({
  languages: [
    { id: 1, name: 'English', isEnabled: true, sortOrder: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 2, name: 'Spanish', isEnabled: true, sortOrder: 2, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 3, name: 'French', isEnabled: true, sortOrder: 3, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  ],
  isLoading: false,
  refresh: vi.fn(),
});

mockUseMessage.mockReturnValue({
  showMessage: vi.fn(),
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showInfo: vi.fn(),
  showWarning: vi.fn(),
  showProgress: vi.fn(),
  showSystemError: vi.fn(),
  showRetryableError: vi.fn(),
});

mockUseDialogState.mockReturnValue({
  data: null,
  isOpen: false,
  open: vi.fn(),
  close: vi.fn(),
  setOpen: vi.fn()
});

describe('Document Translator Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default useDocuments mock implementation
    mockUseDocuments.mockReturnValue({
      documents: [],
      isLoading: false,
      error: null,
      translationProgress: new Map(),
      translations: new Map(),
      refreshDocuments: vi.fn(),
      uploadDocument: vi.fn(),
      downloadDocument: vi.fn(),
      downloadTranslation: vi.fn(),
      deleteDocument: vi.fn(),
      editDocument: vi.fn(),
      bulkDeleteDocuments: vi.fn(),
      translateDocument: vi.fn(),
      getTranslationProgress: vi.fn(),
      getTranslations: vi.fn(),
      createDocument: vi.fn(),
    });
  });

  describe('Full Document Workflow Integration', () => {
    it('should handle complete upload-translate-download workflow', async () => {
      const mockDocuments = [
        {
          id: 1,
          name: 'Test Document',
          createdAt: '8/2/2025',
          updatedAt: '8/2/2025',
          type: 'original' as const,
          translationsCount: 0,
          hasIntegrityIssue: false,
          wasCleared: false
        }
      ];

      const mockHookReturn = {
        documents: mockDocuments,
        isLoading: false,
        error: null,
        translationProgress: new Map(),
        translations: new Map(),
        refreshDocuments: vi.fn(),
        uploadDocument: vi.fn().mockResolvedValue(mockDocuments[0]),
        downloadDocument: vi.fn(),
        downloadTranslation: vi.fn(),
        deleteDocument: vi.fn(),
        editDocument: vi.fn(),
        bulkDeleteDocuments: vi.fn(),
        translateDocument: vi.fn(),
        getTranslationProgress: vi.fn(),
        getTranslations: vi.fn().mockResolvedValue([]),
        createDocument: vi.fn(),
      };

      mockUseDocuments.mockReturnValue(mockHookReturn);

      render(<DocumentTranslator />);

      // Verify initial render
      expect(screen.getByText('Document Translator')).toBeInTheDocument();
      expect(screen.getByText('Upload Document')).toBeInTheDocument();

      // Test upload workflow
      const uploadButton = screen.getByRole('button', { name: /upload document/i });
      fireEvent.click(uploadButton);

      // Should open upload dialog - look for the dialog heading
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /upload document/i })).toBeInTheDocument();
      });
    });

    it('should handle error states gracefully', async () => {
      const mockHookReturn = {
        documents: [],
        isLoading: false,
        error: 'Failed to load documents',
        translationProgress: new Map(),
        translations: new Map(),
        refreshDocuments: vi.fn(),
        uploadDocument: vi.fn(),
        downloadDocument: vi.fn(),
        downloadTranslation: vi.fn(),
        deleteDocument: vi.fn(),
        editDocument: vi.fn(),
        bulkDeleteDocuments: vi.fn(),
        translateDocument: vi.fn(),
        getTranslationProgress: vi.fn(),
        getTranslations: vi.fn(),
        createDocument: vi.fn(),
      };

      mockUseDocuments.mockReturnValue(mockHookReturn);

      render(<DocumentTranslator />);

      // Component should still render despite error
      expect(screen.getByText('Document Translator')).toBeInTheDocument();
    });
  });

  describe('Date Consistency Across Components', () => {
    it('should maintain consistent date formatting throughout component tree', async () => {
      const testDate = '2025-08-02T05:30:00.000Z';
      // Asserted against the shared formatter rather than a second copy of the
      // format. This test previously re-implemented `2-digit` options, so it
      // pinned one of the five variants that were drifting instead of the
      // standard it meant to check.
      const expectedFormattedDate = formatDate(testDate);
      
      const mockDocuments = [
        {
          id: 1,
          name: 'Date Consistency Test',
          createdAt: testDate,
          updatedAt: testDate,
          type: 'original' as const,
          hasIntegrityIssue: false,
          wasCleared: false
        },
        {
          id: 10,
          name: 'Translation Test',
          createdAt: testDate,
          updatedAt: testDate,
          type: 'translated' as const,
          parentId: 1,
          language: 'Spanish',
          hasIntegrityIssue: false,
          wasCleared: false
        }
      ];

      const mockHookReturn = {
        documents: mockDocuments,
        isLoading: false,
        error: null,
        translationProgress: new Map(),
        translations: new Map(),
        refreshDocuments: vi.fn(),
        uploadDocument: vi.fn(),
        downloadDocument: vi.fn(),
        downloadTranslation: vi.fn(),
        deleteDocument: vi.fn(),
        editDocument: vi.fn(),
        bulkDeleteDocuments: vi.fn(),
        translateDocument: vi.fn(),
        getTranslationProgress: vi.fn(),
        getTranslations: vi.fn(),
        createDocument: vi.fn(),
      };

      mockUseDocuments.mockReturnValue(mockHookReturn);

      render(<DocumentTranslator />);

      // Both original and translated documents should show same date format
      const dateElements = screen.getAllByText(expectedFormattedDate);
      expect(dateElements.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Bulk Operations Integration', () => {
    it('should coordinate bulk operations between components correctly', async () => {
      const mockDocuments = [
        {
          id: 1,
          name: 'Bulk Test 1',
          createdAt: '8/2/2025',
          updatedAt: '8/2/2025',
          type: 'original' as const,
          translationsCount: 2,
          hasIntegrityIssue: false,
          wasCleared: false
        },
        {
          id: 2,
          name: 'Bulk Test 2',
          createdAt: '8/2/2025',
          updatedAt: '8/2/2025',
          type: 'original' as const,
          translationsCount: 1,
          hasIntegrityIssue: false,
          wasCleared: false
        }
      ];

      const mockHookReturn = {
        documents: mockDocuments,
        isLoading: false,
        error: null,
        translationProgress: new Map(),
        translations: new Map(),
        refreshDocuments: vi.fn(),
        uploadDocument: vi.fn(),
        downloadDocument: vi.fn(),
        downloadTranslation: vi.fn(),
        deleteDocument: vi.fn(),
        editDocument: vi.fn(),
        bulkDeleteDocuments: vi.fn(),
        translateDocument: vi.fn(),
        getTranslationProgress: vi.fn(),
        getTranslations: vi.fn(),
        createDocument: vi.fn(),
      };

      mockUseDocuments.mockReturnValue(mockHookReturn);

      render(<DocumentTranslator />);

      // Should render documents with bulk action capabilities
      expect(screen.getByText('Bulk Test 1')).toBeInTheDocument();
      expect(screen.getByText('Bulk Test 2')).toBeInTheDocument();
    });
  });

  describe('Translation Progress Integration', () => {
    it('should handle translation progress updates correctly', async () => {
      const mockProgressMap = new Map([
        ['1-Spanish', {
          documentId: 1,
          language: 'Spanish',
          status: 'processing' as const,
          progress: 50,
          message: 'Translating segments...'
        }]
      ]);

      const mockHookReturn = {
        documents: [],
        isLoading: false,
        error: null,
        translationProgress: mockProgressMap,
        translations: new Map(),
        refreshDocuments: vi.fn(),
        uploadDocument: vi.fn(),
        downloadDocument: vi.fn(),
        downloadTranslation: vi.fn(),
        deleteDocument: vi.fn(),
        editDocument: vi.fn(),
        bulkDeleteDocuments: vi.fn(),
        translateDocument: vi.fn(),
        getTranslationProgress: vi.fn(),
        getTranslations: vi.fn(),
        createDocument: vi.fn(),
      };

      mockUseDocuments.mockReturnValue(mockHookReturn);

      render(<DocumentTranslator />);

      // Component should handle progress state without crashing
      expect(screen.getByText('Document Translator')).toBeInTheDocument();
    });
  });

  describe('Error Boundary Integration', () => {
    it('should catch and display errors through error boundary', async () => {
      // Mock a hook that throws an error
      mockUseDocuments.mockImplementation(() => {
        throw new Error('Test error for error boundary');
      });

      render(<DocumentTranslator />);

      // Should show error boundary fallback
      await waitFor(() => {
        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      });
    });
  });
});
