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
import { useMessage } from '@/hooks/message/useMessage'
import {
  BaseDialogProps,
  ValidationState,
  ValidationType,
  StepMode,
  ConfigData
} from './types'

export function BaseAIConfigDialog<T extends ConfigData>({
  open,
  onOpenChange,
  mode,
  title,
  getSteps,
  initialData,
  onSave,
  isLoading = false,
  existingData
}: BaseDialogProps<T>) {
  const { showMessage, showError } = useMessage()
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [data, setData] = useState<T>(initialData)
  const [validation, setValidation] = useState<ValidationState>({
    showValidation: false,
    errors: {}
  })

  // Calculate steps dynamically based on current data
  const steps = getSteps(data)
  const currentStep = steps[currentStepIndex]
  const isFirstStep = currentStepIndex === 0
  const isLastStep = currentStepIndex === steps.length - 1

  // Reset state only when dialog opens/closes to avoid overwriting user edits.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid resets on referential prop changes
  useEffect(() => {
    if (open) {
      setCurrentStepIndex(0)
      setData(mode === 'edit' && existingData ? { ...initialData, ...existingData } : initialData)
      setValidation({ showValidation: false, errors: {} })
    } else {
      setCurrentStepIndex(0)
      setData(initialData)
      setValidation({ showValidation: false, errors: {} })
    }
  }, [open, mode])

  // Adjust step index when steps array changes
  useEffect(() => {
    if (currentStepIndex >= steps.length && steps.length > 0) {
      setCurrentStepIndex(steps.length - 1)
    }
  }, [steps.length, currentStepIndex])

  const handleDataChange = (updates: Partial<T>) => {
    setData(prev => ({ ...prev, ...updates }))
  }

  const handleBlur = (field: keyof T, validationType: ValidationType = 'required') => {
    // Validation logic will be handled by individual step components
    // This provides a consistent interface for all steps
  }

  const handleNext = () => {
    const step = steps[currentStepIndex]
    
    // Validate current step if validation function provided
    if (step.validate && !step.validate(data)) {
      setValidation(prev => ({ ...prev, showValidation: true }))
      showError('Please fix validation errors before proceeding')
      return
    }

    if (!isLastStep) {
      setCurrentStepIndex(prev => prev + 1)
    }
  }

  const handleBack = () => {
    if (!isFirstStep) {
      setCurrentStepIndex(prev => prev - 1)
    }
  }

  const handleSave = async () => {
    const success = await onSave(data)
    if (success) {
      handleClose(false)
    }
  }

  const handleClose = (open: boolean) => {
    if (!open) {
      setCurrentStepIndex(0)
      setData(initialData)
      setValidation({ showValidation: false, errors: {} })
    }
    onOpenChange(open)
  }

  // Determine if current step is valid for navigation
  const isStepValid = () => {
    const step = steps[currentStepIndex]
    return step.validate ? step.validate(data) : true
  }

  // Get dialog title based on mode
  const getDialogTitle = () => {
    return mode === 'add' ? `Add ${title}` : `Edit ${title}`
  }

  // Get step description
  const getStepDescription = () => {
    return currentStep?.description || ''
  }

  if (!currentStep) return null

  const StepComponent = currentStep.component

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>{getDialogTitle()}</DialogTitle>
          <DialogDescription>{getStepDescription()}</DialogDescription>
        </DialogHeader>

        {/* Fixed height content area (shadcn ScrollArea; definite height so
            the Radix viewport is bounded and scrolls — see AGENTS.md). */}
        <ScrollArea className="h-[480px]">
          <StepComponent
            mode={mode}
            data={data}
            onChange={handleDataChange}
            isLoading={isLoading}
            validation={validation}
            onBlur={handleBlur}
          />
        </ScrollArea>

        {/* Navigation buttons outside fixed container */}
        <div className="flex justify-between pt-4">
          {isFirstStep ? (
            <Button variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
          ) : (
            <Button variant="outline" onClick={handleBack}>
              Back
            </Button>
          )}

          {isLastStep ? (
            <Button 
              onClick={handleSave} 
              disabled={!isStepValid() || isLoading}
            >
              {isLoading 
                ? (mode === 'add' ? 'Creating...' : 'Saving...') 
                : (mode === 'add' ? `Create ${title}` : 'Save Changes')
              }
            </Button>
          ) : (
            <Button 
              onClick={handleNext} 
              disabled={!isStepValid()}
            >
              Next
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
