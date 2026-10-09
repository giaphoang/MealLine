// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React from 'react'
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Edit3 } from "@/components/ui/icons";
import { StepWrapper } from '../shared/StepWrapper'
import { PromptConfigStepProps } from '../shared/types'

export function PromptConfigStep({
  data,
  onChange,
  isLoading = false,
  validation,
  onBlur
}: PromptConfigStepProps) {
  const isClassificationPrompt = data.promptCategory === 'classification'

  return (
    <StepWrapper 
      icon={Edit3} 
      title={isClassificationPrompt ? "Auto-Format Rules" : "Prompt Configuration"} 
      description={
        isClassificationPrompt 
          ? "Configure rules for automatic document formatting options"
          : "Customize the AI prompt template for your specific use case"
      }
    >
      <div className="space-y-2">
        <Label htmlFor="serviceDescription">Service Description</Label>
        <Textarea
          id="serviceDescription"
          value={data.serviceDescription}
          onChange={(e) => onChange({ serviceDescription: e.target.value })}
          onBlur={() => onBlur?.('serviceDescription')}
          placeholder="Brief description of what this AI service does..."
          rows={3}
          maxLength={500}
          disabled={isLoading}
          className={`${validation?.showValidation && validation?.errors?.serviceDescription ? 'border-destructive' : ''}`}
        />
        <div className="flex justify-between">
          <p className="text-xs text-muted-foreground">
            Describe the purpose and functionality of this AI configuration
          </p>
          <p className="text-xs text-muted-foreground">
            {data.serviceDescription.length}/500 characters
          </p>
        </div>
      </div>

      {isClassificationPrompt ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="skipTranslationRules">Skip Translation Rules</Label>
            <Textarea
              id="skipTranslationRules"
              value={data.skipTranslationRules}
              onChange={(e) => onChange({ skipTranslationRules: e.target.value })}
              onBlur={() => onBlur?.('skipTranslationRules')}
              placeholder="Describe when content should not be translated..."
              rows={3}
              maxLength={500}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Rules for identifying content that should skip translation
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="includeEnglishRules">Include English Rules</Label>
            <Textarea
              id="includeEnglishRules"
              value={data.includeEnglishRules}
              onChange={(e) => onChange({ includeEnglishRules: e.target.value })}
              onBlur={() => onBlur?.('includeEnglishRules')}
              placeholder="Describe when to include original English text..."
              rows={3}
              maxLength={500}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Rules for including original English alongside translations
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="translationApproach">Translation Approach</Label>
            <Textarea
              id="translationApproach"
              value={data.translationApproach}
              onChange={(e) => onChange({ translationApproach: e.target.value })}
              onBlur={() => onBlur?.('translationApproach')}
              placeholder="Describe the translation methodology and style..."
              rows={3}
              maxLength={500}
              disabled={isLoading}
              className={`${validation?.showValidation && validation?.errors?.translationApproach ? 'border-destructive' : ''}`}
            />
            <p className="text-xs text-muted-foreground">
              Specify translation style, tone, and methodology
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contextGuidance">Context Guidance</Label>
            <Textarea
              id="contextGuidance"
              value={data.contextGuidance}
              onChange={(e) => onChange({ contextGuidance: e.target.value })}
              onBlur={() => onBlur?.('contextGuidance')}
              placeholder="Provide context about the content being translated..."
              rows={3}
              maxLength={500}
              disabled={isLoading}
              className={`${validation?.showValidation && validation?.errors?.contextGuidance ? 'border-destructive' : ''}`}
            />
            <p className="text-xs text-muted-foreground">
              Background information to help with accurate translation
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="additionalGuidance">Additional Guidance</Label>
            <Textarea
              id="additionalGuidance"
              value={data.additionalGuidance}
              onChange={(e) => onChange({ additionalGuidance: e.target.value })}
              onBlur={() => onBlur?.('additionalGuidance')}
              placeholder="Any additional instructions or considerations..."
              rows={3}
              maxLength={500}
              disabled={isLoading}
              className={`${validation?.showValidation && validation?.errors?.additionalGuidance ? 'border-destructive' : ''}`}
            />
            <p className="text-xs text-muted-foreground">
              Special instructions, exceptions, or additional context
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Remember Formatting Choices</Label>
              <p className="text-sm text-muted-foreground">
                Remember user formatting preferences across sessions
              </p>
            </div>
            <Switch
              checked={data.rememberFormattingChoices}
              onCheckedChange={(checked) => onChange({ rememberFormattingChoices: checked })}
              disabled={isLoading}
            />
          </div>
        </>
      )}
    </StepWrapper>
  )
}
