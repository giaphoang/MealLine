// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Trash2, BarChart3, FileText, Sliders, Edit } from "@/components/ui/icons";
import { useMessage } from '@/hooks/message/useMessage'
import { SystemPrompt, PromptType } from '@/types/system-prompt'
import { SystemPromptService } from '@/services/system-prompt'
import {
  EditSystemPromptFormData,
  EditValidationErrors,
  CacheStatistics
} from './shared/types'
import {
  validateField
} from './shared/validation'
import { TabbedPromptConfigStep } from './steps/TabbedPromptConfigStep'

type EditPromptStep = 'basic' | 'configuration' | 'thresholds' | 'parameters' | 'cache' | 'review'

interface EditSystemPromptDialogProps {
  open: boolean
  configuration: any | null // UnifiedConfiguration
  systemPromptData: SystemPrompt | null
  onOpenChange: (open: boolean) => void
  onSave: () => Promise<void>
  isLoading?: boolean
}

export function EditSystemPromptDialog({
  open,
  configuration,
  systemPromptData,
  onOpenChange,
  onSave,
  isLoading = false
}: EditSystemPromptDialogProps) {
  const { showMessage } = useMessage()
  const [step, setStep] = useState<EditPromptStep>('basic')
  const [formData, setFormData] = useState<EditSystemPromptFormData>({
    name: '',
    description: '',
    isActive: true,
    temperature: 0.7,
    topP: 1.0,
    serviceDescription: '',
    translationApproach: '',
    contextGuidance: '',
    additionalGuidance: '',
    skipTranslation: '',
    includeEnglish: '',
    skipTranslationThreshold: 0.7,
    includeEnglishThreshold: 0.7,
    rememberFormattingChoices: true
  })
  const [errors, setErrors] = useState<EditValidationErrors>({})
  const [showValidation, setShowValidation] = useState(false)
  const [cacheStats, setCacheStats] = useState<CacheStatistics | null>(null)
  const [isCacheLoading, setIsCacheLoading] = useState(false)
  const [isCacheClearing, setIsCacheClearing] = useState(false)

  // Initialize form data when dialog opens
  useEffect(() => {
    if (open && systemPromptData) {
      setFormData({
        name: systemPromptData.name || '',
        description: systemPromptData.description || '',
        isActive: systemPromptData.isActive,
        temperature: systemPromptData.temperature || 0.7,
        topP: systemPromptData.topP || 1.0,
        serviceDescription: systemPromptData.serviceDescription || '',
        translationApproach: systemPromptData.translationApproach || '',
        contextGuidance: systemPromptData.contextGuidance || '',
        additionalGuidance: systemPromptData.additionalGuidance || '',
        skipTranslation: systemPromptData.skipTranslation || '',
        includeEnglish: systemPromptData.includeEnglish || '',
        skipTranslationThreshold: systemPromptData.skipTranslationThreshold || 0.7,
        includeEnglishThreshold: systemPromptData.includeEnglishThreshold || 0.7,
        rememberFormattingChoices: systemPromptData.rememberFormattingChoices ?? true
      })
      setErrors({})
      setShowValidation(false)
      setStep('basic')

      // Load cache stats for CLASSIFICATION prompts
      if (systemPromptData.promptType === 'CLASSIFICATION') {
        loadCacheStats(systemPromptData.id)
      }
    }
  }, [open, systemPromptData])

  // Load cache statistics
  const loadCacheStats = async (promptId: number) => {
    setIsCacheLoading(true)
    try {
      const systemPromptService = new SystemPromptService()
      const stats = await systemPromptService.getCacheStats(promptId)
      setCacheStats(stats)
    } catch (error) {
      console.error('Failed to load cache stats:', error)
      setCacheStats(null)
    } finally {
      setIsCacheLoading(false)
    }
  }

  // Clear cache
  const handleClearCache = async () => {
    if (!systemPromptData?.id) return
    
    setIsCacheClearing(true)
    try {
      const systemPromptService = new SystemPromptService()
      const result = await systemPromptService.clearCache(systemPromptData.id)
      showMessage(result.message, 'success')
      
      // Reload cache stats
      await loadCacheStats(systemPromptData.id)
    } catch (error) {
      console.error('Failed to clear cache:', error)
      showMessage(error instanceof Error ? error.message : 'Failed to clear cache', 'error')
    } finally {
      setIsCacheClearing(false)
    }
  }

  // Get step sequence based on prompt type
  const getStepSequence = (promptType?: PromptType): EditPromptStep[] => {
    if (promptType === 'CLASSIFICATION') {
      return ['basic', 'configuration', 'thresholds', 'cache', 'review']
    }
    return ['basic', 'configuration', 'parameters', 'review']
  }

  const steps = getStepSequence(systemPromptData?.promptType)
  const currentStepIndex = steps.indexOf(step)
  const isFirstStep = currentStepIndex === 0
  const isLastStep = currentStepIndex === steps.length - 1

  // Field change handler
  const handleFieldChange = (field: keyof EditSystemPromptFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }

  // Field blur handler
  const handleBlur = (field: keyof EditSystemPromptFormData) => {
    const error = validateField(field, formData[field])
    setErrors(prev => ({ ...prev, [field]: error }))
    setShowValidation(true)
  }

  // Validate current step
  const validateCurrentStep = (): boolean => {
    const stepFields: Record<EditPromptStep, (keyof EditSystemPromptFormData)[]> = {
      basic: ['name', 'description'],
      configuration: systemPromptData?.promptType === 'CLASSIFICATION' 
        ? ['skipTranslation', 'includeEnglish']
        : ['serviceDescription', 'translationApproach', 'contextGuidance', 'additionalGuidance'],
      thresholds: [],
      parameters: [], // Skip validation for numeric fields - sliders enforce constraints
      cache: [],
      review: []
    }

    const fieldsToValidate = stepFields[step] || []
    const newErrors: EditValidationErrors = {}
    
    // Special handling for configuration step with translation prompts
    if (step === 'configuration' && systemPromptData?.promptType !== 'CLASSIFICATION') {
      // Use OR logic: at least one of the prompt configuration fields must be filled
      // This matches the Add dialog's isNameFormValid logic
      const hasCustomizations = formData.serviceDescription.trim() ||
                               formData.translationApproach.trim() ||
                               formData.contextGuidance.trim() ||
                               formData.additionalGuidance.trim()
      
      if (!hasCustomizations) {
        // Add error to the first empty field to show user where to add content
        if (!formData.serviceDescription.trim()) newErrors.serviceDescription = 'At least one prompt configuration field must be filled'
        else if (!formData.translationApproach.trim()) newErrors.translationApproach = 'At least one prompt configuration field must be filled'
        else if (!formData.contextGuidance.trim()) newErrors.contextGuidance = 'At least one prompt configuration field must be filled'
        else if (!formData.additionalGuidance.trim()) newErrors.additionalGuidance = 'At least one prompt configuration field must be filled'
      }
    } else {
      // Standard validation for all other steps
      fieldsToValidate.forEach(field => {
        const error = validateField(field, formData[field])
        if (error) {
          newErrors[field] = error
        }
      })
    }
    
    setErrors(prev => ({ ...prev, ...newErrors }))
    setShowValidation(true)
    
    return Object.keys(newErrors).length === 0
  }

  // Navigation handlers
  const handleNext = () => {
    if (!validateCurrentStep()) {
      showMessage('Please fix validation errors before proceeding', 'error')
      return
    }
    
    if (!isLastStep) {
      setStep(steps[currentStepIndex + 1])
    }
  }

  const handlePrevious = () => {
    if (!isFirstStep) {
      setStep(steps[currentStepIndex - 1])
    }
  }

  // Save handler
  const handleSave = async () => {
    if (!systemPromptData) return

    if (!validateCurrentStep()) {
      showMessage('Please fix validation errors before saving', 'error')
      return
    }

    try {
      const systemPromptService = new SystemPromptService()
      
      await systemPromptService.updateSystemPrompt({
        id: systemPromptData.id,
        name: formData.name.trim(),
        promptType: systemPromptData.promptType,
        isActive: formData.isActive,
        isDefault: systemPromptData.isDefault,
        description: formData.description.trim() || undefined,
        serviceDescription: formData.serviceDescription.trim() || undefined,
        translationApproach: formData.translationApproach.trim() || undefined,
        contextGuidance: formData.contextGuidance.trim() || undefined,
        additionalGuidance: formData.additionalGuidance.trim() || undefined,
        skipTranslation: formData.skipTranslation.trim() || undefined,
        includeEnglish: formData.includeEnglish.trim() || undefined,
        skipTranslationThreshold: formData.skipTranslationThreshold,
        includeEnglishThreshold: formData.includeEnglishThreshold,
        rememberFormattingChoices: formData.rememberFormattingChoices,
        temperature: formData.temperature,
        topP: formData.topP
      })
      
      showMessage('System prompt updated successfully', 'success')
      await onSave()
      onOpenChange(false)
    } catch (error) {
      showMessage(error instanceof Error ? error.message : 'Failed to save configuration', 'error')
    }
  }

  // Close handler
  const handleClose = () => {
    onOpenChange(false)
    setErrors({})
    setShowValidation(false)
    setStep('basic')
  }

  if (!systemPromptData) return null

  // Step content renderers
  const renderBasicStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <FileText className="h-12 w-12 mx-auto text-muted-foreground" />
        <h3 className="mt-2 text-lg font-medium">Basic Information</h3>
        <p className="text-sm text-muted-foreground">
          Update name, description, and active status
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="edit-name">Configuration Name</Label>
          <Input
            id="edit-name"
            value={formData.name}
            onChange={(e) => handleFieldChange('name', e.target.value)}
            onBlur={() => handleBlur('name')}
            placeholder="Enter configuration name"
            disabled={isLoading}
            className={showValidation && errors.name ? 'border-destructive' : ''}
          />
          {showValidation && errors.name && (
            <p className="text-sm text-destructive">{errors.name}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-description">Description (Optional)</Label>
          <Textarea
            id="edit-description"
            value={formData.description}
            onChange={(e) => handleFieldChange('description', e.target.value)}
            onBlur={() => handleBlur('description')}
            placeholder="Enter configuration description"
            rows={3}
            disabled={isLoading}
            className={showValidation && errors.description ? 'border-destructive' : ''}
          />
          <div className="flex justify-between">
            {showValidation && errors.description ? (
              <p className="text-sm text-destructive">{errors.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Optional description for this configuration</p>
            )}
            <p className="text-sm text-muted-foreground">
              {formData.description.length}/500
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="edit-active">Active Status</Label>
            <p className="text-sm text-muted-foreground">
              Enable or disable this configuration
            </p>
          </div>
          <Switch
            id="edit-active"
            checked={formData.isActive}
            onCheckedChange={(checked) => handleFieldChange('isActive', checked)}
            disabled={isLoading}
          />
        </div>
      </div>
    </div>
  )

  const renderConfigurationStep = () => {
    if (systemPromptData.promptType === 'CLASSIFICATION') {
      return (
        <div className="space-y-6">
          <div className="text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground" />
            <h3 className="mt-2 text-lg font-medium">Classification Rules</h3>
            <p className="text-sm text-muted-foreground">
              Define when to skip translations and include English text
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-skip-translation">Skip Translations</Label>
              <Textarea
                id="edit-skip-translation"
                value={formData.skipTranslation}
                onChange={(e) => handleFieldChange('skipTranslation', e.target.value)}
                placeholder="Describe text segments to be tagged for skipping translation (e.g., 'Administrative forms, legal disclaimers, internal codes...')"
                rows={3}
                disabled={isLoading}
              />
              <p className="text-sm text-muted-foreground">
                Define criteria for content that should remain untranslated
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-include-english">Include English</Label>
              <Textarea
                id="edit-include-english"
                value={formData.includeEnglish}
                onChange={(e) => handleFieldChange('includeEnglish', e.target.value)}
                placeholder="Describe text segments to be tagged to include original English text (e.g., 'Technical terms, brand names, specific measurements...')"
                rows={3}
                disabled={isLoading}
              />
              <p className="text-sm text-muted-foreground">
                Define rules for when to append original English text to translations
              </p>
            </div>
          </div>
        </div>
      )
    }

    // Convert EditSystemPromptFormData to PromptConfigData for the tabbed component
    const promptConfigData = {
      type: 'prompt' as const,
      name: formData.name,
      description: formData.description,
      temperature: formData.temperature,
      topP: formData.topP,
      promptCategory: 'translation', // default for edit mode
      serviceDescription: formData.serviceDescription,
      translationApproach: formData.translationApproach,
      contextGuidance: formData.contextGuidance,
      additionalGuidance: formData.additionalGuidance,
      skipTranslationRules: '',
      includeEnglishRules: '',
      skipTranslationThreshold: 0.7,
      includeEnglishThreshold: 0.7,
      rememberFormattingChoices: true,
      value: ''
    }

    const validationState = {
      showValidation,
      errors: {
        serviceDescription: errors.serviceDescription,
        translationApproach: errors.translationApproach,
        contextGuidance: errors.contextGuidance,
        additionalGuidance: errors.additionalGuidance
      }
    }

    return (
      <TabbedPromptConfigStep
        mode="edit"
        data={promptConfigData}
        onChange={(updates) => {
          if (updates.serviceDescription !== undefined) handleFieldChange('serviceDescription', updates.serviceDescription)
          if (updates.translationApproach !== undefined) handleFieldChange('translationApproach', updates.translationApproach)
          if (updates.contextGuidance !== undefined) handleFieldChange('contextGuidance', updates.contextGuidance)
          if (updates.additionalGuidance !== undefined) handleFieldChange('additionalGuidance', updates.additionalGuidance)
        }}
        isLoading={isLoading}
        validation={validationState}
        onBlur={(field) => {
          if (field === 'serviceDescription') handleBlur('serviceDescription')
          if (field === 'translationApproach') handleBlur('translationApproach')
          if (field === 'contextGuidance') handleBlur('contextGuidance')
          if (field === 'additionalGuidance') handleBlur('additionalGuidance')
        }}
      />
    )
  }

  const renderThresholdsStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <Sliders className="h-12 w-12 mx-auto text-muted-foreground" />
        <h3 className="mt-2 text-lg font-medium">Threshold Parameters</h3>
        <p className="text-sm text-muted-foreground">
          Configure classification confidence levels
        </p>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="edit-remember-formatting">Remember Formatting Choices</Label>
            <p className="text-sm text-muted-foreground">
              Cache AI decisions to improve consistency
            </p>
          </div>
          <Switch
            id="edit-remember-formatting"
            checked={formData.rememberFormattingChoices}
            onCheckedChange={(checked) => handleFieldChange('rememberFormattingChoices', checked)}
            disabled={isLoading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-skip-translation-threshold">Skip Translation Threshold</Label>
          <div className="px-3">
            <Slider
              value={[formData.skipTranslationThreshold]}
              onValueChange={([value]) => handleFieldChange('skipTranslationThreshold', value)}
              min={0.1}
              max={1.0}
              step={0.1}
              className="w-full"
              disabled={isLoading}
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>0.1 (Nearly every segment)</span>
              <span className="font-medium">{formData.skipTranslationThreshold}</span>
              <span>1.0 (Only most certain)</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Lower values = more segments tagged for skipping, Higher values = only most certain matches tagged
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-include-english-threshold">Include English Threshold</Label>
          <div className="px-3">
            <Slider
              value={[formData.includeEnglishThreshold]}
              onValueChange={([value]) => handleFieldChange('includeEnglishThreshold', value)}
              min={0.1}
              max={1.0}
              step={0.1}
              className="w-full"
              disabled={isLoading}
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>0.1 (Nearly every segment)</span>
              <span className="font-medium">{formData.includeEnglishThreshold}</span>
              <span>1.0 (Only most certain)</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Lower values = more segments tagged for English inclusion, Higher values = only most certain matches tagged
          </p>
        </div>
      </div>
    </div>
  )

  const renderParametersStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <Sliders className="h-12 w-12 mx-auto text-muted-foreground" />
        <h3 className="mt-2 text-lg font-medium">Performance Parameters</h3>
        <p className="text-sm text-muted-foreground">
          Fine-tune AI behavior and response characteristics
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="edit-temperature">Temperature (Creativity)</Label>
          <div className="px-3">
            <Slider
              value={[formData.temperature]}
              onValueChange={([value]) => handleFieldChange('temperature', value)}
              min={0}
              max={2}
              step={0.1}
              className="w-full"
              disabled={isLoading}
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>0.0 (Focused)</span>
              <span className="font-medium">{formData.temperature}</span>
              <span>2.0 (Creative)</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Lower values = more focused and deterministic, Higher values = more creative and random
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-top-p">Top-p (Response Diversity)</Label>
          <div className="px-3">
            <Slider
              value={[formData.topP]}
              onValueChange={([value]) => handleFieldChange('topP', value)}
              min={0}
              max={1}
              step={0.1}
              className="w-full"
              disabled={isLoading}
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>0.0 (Narrow)</span>
              <span className="font-medium">{formData.topP}</span>
              <span>1.0 (Full)</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Lower values = narrower vocabulary selection, Higher values = full vocabulary range
          </p>
        </div>
      </div>
    </div>
  )

  const renderCacheStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground" />
        <h3 className="mt-2 text-lg font-medium">Cache Management</h3>
        <p className="text-sm text-muted-foreground">
          Monitor and manage cached classification decisions
        </p>
      </div>

      <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
        {isCacheLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            Loading cache statistics...
          </div>
        ) : cacheStats ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium text-foreground">{cacheStats.cachedChoicesCount}</p>
                <p className="text-muted-foreground">Cached choices</p>
              </div>
              <div>
                <p className="font-medium text-foreground">{cacheStats.cacheHitRate}%</p>
                <p className="text-muted-foreground">Cache hit rate</p>
              </div>
              <div>
                <p className="font-medium text-foreground">{cacheStats.uniqueTextsCount}</p>
                <p className="text-muted-foreground">Unique segments</p>
              </div>
              <div>
                <p className="font-medium text-foreground">{cacheStats.estimatedApiCallsSaved}</p>
                <p className="text-muted-foreground">API calls saved</p>
              </div>
            </div>
            
            {cacheStats.cachedChoicesCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearCache}
                disabled={isCacheClearing || isLoading}
                className="w-full"
              >
                {isCacheClearing ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent mr-2" />
                    Clearing Cache...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear Cache ({cacheStats.cachedChoicesCount} entries)
                  </>
                )}
              </Button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No cache data available for this configuration
          </p>
        )}
      </div>
    </div>
  )

  const renderReviewStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <Edit className="h-12 w-12 mx-auto text-muted-foreground" />
        <h3 className="mt-2 text-lg font-medium">Review & Save</h3>
        <p className="text-sm text-muted-foreground">
          Review your changes and save the configuration
        </p>
      </div>

      <div className="space-y-4">
        <div className="p-4 border rounded-lg bg-muted/50">
          <h4 className="font-medium mb-2">Configuration Summary</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name:</span>
              <span>{formData.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type:</span>
              <span>{systemPromptData.promptType}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Active:</span>
              <span>{formData.isActive ? 'Yes' : 'No'}</span>
            </div>
            {formData.description && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Description:</span>
                <span className="text-right max-w-xs truncate">{formData.description}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  // Render current step content
  const renderStepContent = () => {
    switch (step) {
      case 'basic':
        return renderBasicStep()
      case 'configuration':
        return renderConfigurationStep()
      case 'thresholds':
        return renderThresholdsStep()
      case 'parameters':
        return renderParametersStep()
      case 'cache':
        return renderCacheStep()
      case 'review':
        return renderReviewStep()
      default:
        return null
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Edit System Prompt</DialogTitle>
          <DialogDescription>Modify system prompt configuration</DialogDescription>
        </DialogHeader>

        {/* Fixed height content area (shadcn ScrollArea; definite height so
            the Radix viewport is bounded and scrolls — see AGENTS.md). */}
        <ScrollArea className="h-[480px] px-2">
          {renderStepContent()}
        </ScrollArea>

        {/* Navigation buttons outside fixed container */}
        <div className="flex justify-between pt-4">
          <Button
            variant="outline"
            onClick={isFirstStep ? handleClose : handlePrevious}
            disabled={isLoading}
          >
            {isFirstStep ? 'Cancel' : 'Back'}
          </Button>

          {isLastStep ? (
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          ) : (
            <Button onClick={handleNext} disabled={isLoading}>
              Next
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
