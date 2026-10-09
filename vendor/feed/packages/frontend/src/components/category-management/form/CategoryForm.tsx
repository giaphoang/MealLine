// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { resolveSubmittedName } from "@/lib/formatting/text"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useCategoryForm } from "@/hooks/category/form/useCategoryForm"
import { useMessage } from "@/hooks/message/useMessage"
import { useEffect } from "react"
import { SimpleIconSelector } from "./SimpleIconSelector"
import { DEFAULT_ICON } from "@/lib/food-icons"

interface CategoryFormProps {
  onSubmit: (data: { name: string; limit: number; limitType: 'person' | 'household'; icon: string }) => Promise<void>;
  error?: { message: string } | null;
  isSaving?: boolean;
  initialLimit?: string;
  initialLimitType?: 'person' | 'household';
  initialName?: string;
  initialIcon?: string;
}

export function CategoryForm({ 
  onSubmit, 
  error, 
  isSaving = false,
  initialLimit,
  initialLimitType = 'household',
  initialName = '',
  initialIcon = DEFAULT_ICON
}: CategoryFormProps) {
  const {
    categoryName,
    categoryLimit,
    limitType,
    icon,
    showValidation,
    validationError,
    handleInputChange,
    handleLimitChange,
    handleLimitTypeChange,
    handleIconChange,
    resetForm,
    validateForm,
    getFormattedLimit
  } = useCategoryForm(initialLimit, initialLimitType, initialName, initialIcon);

  const { showMessage } = useMessage();

  // Watch for external errors
  useEffect(() => {
    if (error) {
      showMessage(error.message, 'error');
    }
  }, [error]);

  // Watch for validation errors
  useEffect(() => {
    if (validationError && showValidation) {
      showMessage(validationError, 'error');
    } else {
      // No need to clear message - toast handles this
    }
  }, [validationError, showValidation]);

  // Form options
  const numberOptions = Array.from({ length: 100 }, (_, i) => (i + 1).toString())
  const options = ['no-limit', ...numberOptions]

  const handleSubmit = async () => {
    console.log('Form submission initiated', { categoryName, categoryLimit, icon });
    
    if (!validateForm()) {
      console.log('Form validation failed');
      return;
    }
    console.log('Form validation passed');

    try {
      // Title-Case enforced at submit, not per keystroke (ISSUES.md #38).
      // An untouched name is submitted verbatim so the edit dialog does not
      // mistake reformatting for a rename.
      const trimmedName = resolveSubmittedName(categoryName, initialName);
      // Use the default icon if none is selected
      const iconValue = icon || DEFAULT_ICON;
      console.log('Submitting with data:', { name: trimmedName, limit: getFormattedLimit(), icon: iconValue });
      
      await onSubmit({
        name: trimmedName,
        limit: getFormattedLimit(),
        limitType: limitType,
        icon: iconValue
      });

      resetForm();
    } catch (err) {
      console.error('Form submission error:', err);
      // Error is handled by the parent component via error prop
    }
  }

  const getDisplayValue = (value: string) => {
    return value === 'no-limit' ? 'No Limit' : value
  }

  return (
    <div className="space-y-4">
      <Label htmlFor="categoryName" className="text-sm font-medium mb-2 block">Category Name & Icon</Label>
      <Input
        value={categoryName}
        onChange={handleInputChange}
        disabled={isSaving}
        placeholder="Enter category name..."
        maxLength={36}
        className={`w-full ${showValidation && validationError ? 'border-destructive' : ''}`}
      />

      <div className="space-y-4">
        <div className="mb-4 relative">
          <SimpleIconSelector 
            value={icon} 
            onChange={handleIconChange} 
            disabled={isSaving} 
          />
        </div>
        <Label htmlFor="categoryLimit" className="text-sm font-medium mb-2 block">Limit Setting</Label>
        <Select
          value={categoryLimit}
          onValueChange={handleLimitChange}
          disabled={isSaving}
        >
          <SelectTrigger className="w-full">
            <SelectValue>
              {getDisplayValue(categoryLimit)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {options.map((value) => (
              <SelectItem key={value} value={value}>
                {getDisplayValue(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center space-x-2">
          <Switch 
            id="limit-type"
            checked={limitType === 'person'}
            onCheckedChange={handleLimitTypeChange}
            disabled={isSaving}
          />
          <Label htmlFor="limit-type" className="text-sm font-medium">
            {limitType === 'person' ? 'Per Person' : 'Per Household'}
          </Label>
        </div>
      </div>


      <Button 
        onClick={handleSubmit} 
        disabled={isSaving}
        className="w-full"
      >
        {isSaving ? 'Saving...' : initialName ? 'Update Category' : 'Add Category'}
      </Button>
    </div>
  )
}