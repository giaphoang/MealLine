// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useState } from "react"
import { useMessage } from "@/hooks/message/useMessage"
import { useEffect } from "react"

interface TranslationFormProps {
  onSubmit: (data: { key: string; text: string; language: string }) => Promise<void>;
  error?: { message: string } | null;
  isSaving?: boolean;
  initialData?: {
    key?: string;
    text?: string;
    language?: string;
  };
}

export function TranslationForm({ 
  onSubmit, 
  error, 
  isSaving = false,
  initialData 
}: TranslationFormProps) {
  const [formData, setFormData] = useState({
    key: initialData?.key || '',
    text: initialData?.text || '',
    language: initialData?.language || 'en'
  });

  const [showValidation, setShowValidation] = useState(false);

  const validateForm = () => {
    setShowValidation(true);
    if (formData.key.length < 3 || formData.key.length > 50) {
      return false;
    }
    if (formData.text.length < 1) {
      return false;
    }
    return true;
  };

  const resetForm = () => {
    setFormData({
      key: '',
      text: '',
      language: 'en'
    });
    setShowValidation(false);
  };

  const { showMessage } = useMessage();

  // Watch for external errors
  useEffect(() => {
    if (error) {
      showMessage(error.message, 'error');
    }
  }, [error]);

  // Watch for validation errors
  useEffect(() => {
    if (showValidation) {
      if (formData.key.length < 3) {
        showMessage('Translation key must be at least 3 characters', 'error');
      } else if (formData.key.length > 50) {
        showMessage('Translation key must be less than 50 characters', 'error');
      } else if (formData.text.length < 1) {
        showMessage('Translation text is required', 'error');
      }
    }
  }, [showValidation, formData.key, formData.text, showMessage]);



  const handleSubmit = async () => {
    console.log('Form submission initiated', formData);
    
    if (!validateForm()) {
      console.log('Form validation failed');
      return;
    }
    console.log('Form validation passed');

    try {
      const trimmedKey = formData.key.trim();
      const trimmedText = formData.text.trim();
      console.log('Submitting with data:', { 
        key: trimmedKey, 
        text: trimmedText, 
        language: formData.language 
      });
      
      await onSubmit({
        key: trimmedKey,
        text: trimmedText,
        language: formData.language
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
    <Card className="w-full max-w-md mx-auto bg-card text-card-foreground" data-testid="category-form">
      <CardHeader>
        <CardTitle>Translation Management</CardTitle>
        <CardDescription>
          Manage translations for the application.
          <br />
          Translation keys must be between 3 and 50 characters.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Input
            value={formData.key}
            onChange={(e) => setFormData(prev => ({ ...prev, key: e.target.value }))}
            disabled={isSaving}
            placeholder="Enter translation key..."
            maxLength={50}
            className={`w-full ${showValidation && formData.key.length < 3 ? 'border-destructive' : ''}`}
          />
        </div>

        <div className="space-y-2">
          <Input
            value={formData.text}
            onChange={(e) => setFormData(prev => ({ ...prev, text: e.target.value }))}
            disabled={isSaving}
            placeholder="Enter translation text..."
            className={`w-full ${showValidation && formData.text.length < 1 ? 'border-red-500' : ''}`}
          />
        </div>

        <Select
          value={formData.language}
          onValueChange={(value) => setFormData(prev => ({ ...prev, language: value }))}
          disabled={isSaving}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select language" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="es">Spanish</SelectItem>
            <SelectItem value="fr">French</SelectItem>
          </SelectContent>
        </Select>


        <Button 
          onClick={handleSubmit} 
          disabled={isSaving}
          className="w-full"
        >
          {isSaving ? 'Saving...' : 'Save Translation'}
        </Button>
      </CardContent>
    </Card>
  )
}