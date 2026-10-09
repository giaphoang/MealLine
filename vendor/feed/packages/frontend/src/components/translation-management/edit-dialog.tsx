// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client"

import React from 'react'
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Translation } from '@/types/translation'

interface EditDialogProps {
  translation: Translation | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (translation: Partial<Translation>) => Promise<void>
  isLoading?: boolean
}

interface TranslationFormProps {
  formData: {
    originalText: string
    translatedText: string
  }
  onChange: (field: string, value: string) => void
  isCustomType: boolean
  error: string | null
  isLoading?: boolean
}

// Translation form component with two variants
function TranslationForm({ formData, onChange, isCustomType, error, isLoading }: TranslationFormProps) {
  if (isCustomType) {
    return (
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="original">Original Text</Label>
          <Textarea
            id="original"
            value={formData.originalText}
            onChange={(e) => onChange('originalText', e.target.value)}
            disabled={isLoading}
            placeholder="Enter original text..."
            rows={4}
            className={error && formData.originalText.length < 3 ? 'border-red-500' : ''}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="translation">Translation</Label>
          <Textarea
            id="translation"
            value={formData.translatedText}
            onChange={(e) => onChange('translatedText', e.target.value)}
            disabled={isLoading}
            placeholder="Enter translation..."
            rows={4}
            className={error && formData.translatedText.length < 1 ? 'border-red-500' : ''}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="original">Original Text</Label>
        <div className="p-3 bg-muted rounded-md">
          {formData.originalText}
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="translation">Translation</Label>
        <Textarea
          id="translation"
          value={formData.translatedText}
          onChange={(e) => onChange('translatedText', e.target.value)}
          disabled={isLoading}
          placeholder="Enter translation..."
          className={error && formData.translatedText.length < 1 ? 'border-red-500' : ''}
        />
      </div>
    </div>
  )
}

export function EditDialog({ 
  translation, 
  open, 
  onOpenChange, 
  onSave,
  isLoading 
}: EditDialogProps) {
  const [formData, setFormData] = React.useState({
    originalText: translation?.originalText ?? '',
    translatedText: translation?.translatedText ?? '',
  })
  const [error, setError] = React.useState<string | null>(null)

  // Reset form when opening dialog
  React.useEffect(() => {
    if (open && translation) {
      setFormData({
        originalText: translation.originalText,
        translatedText: translation.translatedText,
      })
      setError(null)
    }
  }, [open, translation])

  // Validate the form
  const validateForm = () => {
    if (formData.originalText.length < 3) {
      setError('Translation key must be at least 3 characters');
      return false;
    }
    if (formData.originalText.length > 1783) {
      setError('Original text must be less than 1,783 characters');
      return false;
    }
    if (formData.translatedText.length < 1) {
      setError('Translation text is required');
      return false;
    }
    setError(null);
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    if (translation) {
      await onSave({
        id: translation.id,
        originalText: formData.originalText.trim(),
        translatedText: formData.translatedText.trim(),
      });
    }
  }

  const handleFieldChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Translation</DialogTitle>
          <DialogDescription>
            Make changes to the translation. Click save when you&apos;re done.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <TranslationForm
            formData={formData}
            onChange={handleFieldChange}
            isCustomType={translation?.type === 'Custom'}
            error={error}
            isLoading={isLoading}
          />
          {error && (
            <p className="text-sm font-medium text-red-500">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            type="submit"
            onClick={handleSave}
            disabled={isLoading}
          >
            {isLoading ? 'Saving...' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}