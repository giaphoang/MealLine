// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useState, useEffect } from 'react';
import { createFormattedChangeHandler, validateMinLength } from '@/lib/formatting/text';
import { LimitType } from '@/types/category';
import { DEFAULT_ICON } from '@/lib/food-icons';

interface CategoryFormState {
  categoryName: string;
  categoryLimit: string;
  limitType: LimitType;
  icon: string;
  showValidation: boolean;
  isVisible: boolean;
  validationError: string | null;
}

export function useCategoryForm(
  initialLimit: string = 'no-limit', 
  initialLimitType: LimitType = 'household', 
  initialName: string = '',
  initialIcon: string = DEFAULT_ICON
) {
  const [formState, setFormState] = useState<CategoryFormState>({
    categoryName: initialName,
    categoryLimit: initialLimit,
    limitType: initialLimitType,
    icon: initialIcon,
    showValidation: false,
    isVisible: false,
    validationError: null
  });

  // Update values only on initial mount
  useEffect(() => {
    setFormState(prev => ({
      ...prev,
      categoryLimit: initialLimit,
      limitType: initialLimitType,
      categoryName: initialName,
      icon: initialIcon
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);  // Empty dependency array - only run on mount

  const handleInputChange = createFormattedChangeHandler((value: string) => {
    setFormState(prev => {
      const newState = {
        ...prev,
        categoryName: value
      };
      
      if (prev.showValidation) {
        if (!validateMinLength(value)) {
          return {
            ...newState,
            isVisible: true,
            validationError: 'Category name must be at least 3 characters'
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
      categoryLimit: value
    }));
  };

  const handleLimitTypeChange = (value: boolean) => {
    setFormState(prev => ({
      ...prev,
      limitType: value ? 'person' : 'household'
    }));
  };

  const handleIconChange = (value: string) => {
    console.log('Icon change:', value);
    setFormState(prev => ({
      ...prev,
      icon: value
    }));
  };

  const resetForm = () => {
    setFormState({
      categoryName: '',
      categoryLimit: 'no-limit',
      limitType: 'person',
      icon: DEFAULT_ICON,
      showValidation: false,
      isVisible: false,
      validationError: null
    });
  };

  const validateForm = () => {
    console.log('Validating form with name:', formState.categoryName);
    
    setFormState(prev => ({
      ...prev,
      showValidation: true
    }));

    const isValid = validateMinLength(formState.categoryName.trim());
    console.log('Form validation result:', isValid);

    if (!isValid) {
      setFormState(prev => ({
        ...prev,
        isVisible: true,
        validationError: 'Category name must be at least 3 characters'
      }));
      return false;
    }

    return true;
  };

  const getFormattedLimit = () => {
    return formState.categoryLimit === 'no-limit' ? 100 : parseInt(formState.categoryLimit, 10);
  };

  return {
    ...formState,
    handleInputChange,
    handleLimitChange,
    handleLimitTypeChange,
    handleIconChange,
    resetForm,
    validateForm,
    getFormattedLimit
  };
}