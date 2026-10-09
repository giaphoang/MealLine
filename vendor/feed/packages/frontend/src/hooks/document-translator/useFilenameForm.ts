// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useState, useEffect, useCallback } from 'react';
import { 
  createFilenameChangeHandler, 
  validateFilename, 
  sanitizeUploadedFilename 
} from '@/lib/formatting/text';

interface FilenameFormState {
  filename: string;
  showValidation: boolean;
  validationError: string | null;
}

export function useFilenameForm(initialFilename: string = '') {
  const [formState, setFormState] = useState<FilenameFormState>({
    filename: initialFilename,
    showValidation: false,
    validationError: null
  });

  // Update filename only on initial mount
  useEffect(() => {
    setFormState(prev => ({
      ...prev,
      filename: initialFilename
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run on mount

  const handleFilenameChange = useCallback(
    createFilenameChangeHandler((value: string) => {
      setFormState(prev => {
        const newState = {
          ...prev,
          filename: value
        };
        
        if (prev.showValidation) {
          const validation = validateFilename(value);
          if (!validation.isValid) {
            return {
              ...newState,
              validationError: validation.error || 'Invalid filename'
            };
          }
          return {
            ...newState,
            validationError: null
          };
        }
        return newState;
      });
    }), []
  );

  const setFilename = useCallback((value: string) => {
    setFormState(prev => ({
      ...prev,
      filename: value,
      validationError: null
    }));
  }, []);

  const resetForm = useCallback(() => {
    setFormState({
      filename: '',
      showValidation: false,
      validationError: null
    });
  }, []);

  const validateForm = useCallback((): boolean => {
    setFormState(prev => ({
      ...prev,
      showValidation: true
    }));

    const validation = validateFilename(formState.filename);
    
    if (!validation.isValid) {
      setFormState(prev => ({
        ...prev,
        validationError: validation.error || 'Invalid filename'
      }));
      return false;
    }

    return true;
  }, [formState.filename]);

  const sanitizeFilename = useCallback((originalName: string) => {
    return sanitizeUploadedFilename(originalName);
  }, []);

  return {
    ...formState,
    handleFilenameChange,
    setFilename,
    resetForm,
    validateForm,
    sanitizeFilename
  };
}
