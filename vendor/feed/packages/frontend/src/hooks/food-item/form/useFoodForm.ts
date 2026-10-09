// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useState, useEffect, useCallback } from 'react';
import { useStatusMessage } from '@/hooks/status/useStatusMessage';
import { createFormattedChangeHandler, validateMinLength } from '@/lib/formatting/text';
import { 
  DEFAULT_DIETARY_FLAGS, 
  DietaryFlags
} from '@/types/food-item';
import { LimitType } from '@/types/category';

interface FoodItemFormState {
  name: string;
  limit: string;
  limitType: LimitType;
  categoryId: string;
  dietaryFlags: DietaryFlags;
  showValidation: boolean;
  isVisible: boolean;
  validationError: string | null;
}

export function useFoodForm(
  initialLimit: string = 'no-limit',
  initialLimitType: LimitType = 'household',
  initialName: string = '',
  initialCategoryId: string = '',
  initialDietaryFlags: DietaryFlags = { ...DEFAULT_DIETARY_FLAGS }
) {
  const { showMessage } = useStatusMessage({
    config: {
      success: { duration: 4000, fadeDelay: 3500 },
      error: { duration: 6000, fadeDelay: 5500 }
    }
  });

  const [formState, setFormState] = useState<FoodItemFormState>({
    name: initialName,
    limit: initialLimit,
    limitType: initialLimitType,
    categoryId: initialCategoryId,
    dietaryFlags: { ...initialDietaryFlags },
    showValidation: false,
    isVisible: false,
    validationError: null
  });

  // Update values only on initial mount
  useEffect(() => {
    setFormState(prev => ({
      ...prev,
      limit: initialLimit,
      limitType: initialLimitType,
      name: initialName,
      categoryId: initialCategoryId,
      dietaryFlags: { ...initialDietaryFlags }
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);  // Empty dependency array - only run on mount

  const handleNameChange = createFormattedChangeHandler((value: string) => {
    setFormState(prev => {
      const newState = {
        ...prev,
        name: value
      };
      
      if (prev.showValidation) {
        if (!validateMinLength(value)) {
          return {
            ...newState,
            isVisible: true,
            validationError: 'Food item name must be at least 3 characters'
          };
        }
        return {
          ...newState,
          isVisible: false,
          validationError: null
        };
      }
      return newState;
    });
  }, { maxLength: 36 });

  const handleLimitChange = (value: string) => {
    setFormState(prev => ({
      ...prev,
      limit: value
    }));
  };

  const handleLimitTypeChange = (value: boolean) => {
    setFormState(prev => ({
      ...prev,
      limitType: value ? 'person' : 'household'
    }));
  };

  const handleCategoryChange = (categoryId: string) => {
    setFormState(prev => ({
      ...prev,
      categoryId,
      validationError: null
    }));
  };

  const handleDietaryFlagChange = useCallback((flag: keyof DietaryFlags, checked: boolean) => {
    setFormState(prev => ({
      ...prev,
      dietaryFlags: {
        ...prev.dietaryFlags,
        [flag]: checked
      }
    }));
  }, []);

  const resetForm = () => {
    // Keep the current category selection when resetting the form
    const currentCategoryId = formState.categoryId;
    
    setFormState({
      name: '',
      limit: 'no-limit',
      limitType: 'household',
      categoryId: currentCategoryId, // Preserve the selected category
      dietaryFlags: { ...DEFAULT_DIETARY_FLAGS },
      showValidation: false,
      isVisible: false,
      validationError: null
    });
  };

  const validateForm = () => {
    setFormState(prev => ({
      ...prev,
      showValidation: true
    }));

    if (!validateMinLength(formState.name)) {
      setFormState(prev => ({
        ...prev,
        isVisible: true,
        validationError: 'Food item name must be at least 3 characters'
      }));
      return false;
    }

    if (!formState.categoryId) {
      setFormState(prev => ({
        ...prev,
        isVisible: true,
        validationError: 'Please select a category'
      }));
      return false;
    }

    return true;
  };

  const getFormattedLimit = () => {
    return formState.limit === 'no-limit' ? 100 : parseInt(formState.limit, 10);
  };

  return {
    name: formState.name,
    limit: formState.limit,
    limitType: formState.limitType,
    categoryId: formState.categoryId,
    dietaryFlags: formState.dietaryFlags,
    showValidation: formState.showValidation,
    validationError: formState.validationError,
    handleNameChange,
    handleLimitChange,
    handleLimitTypeChange,
    handleCategoryChange,
    handleDietaryFlagChange,
    resetForm,
    validateForm,
    getFormattedLimit
  };
}