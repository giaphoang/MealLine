// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React from 'react'
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Tabs,
  TabsContent,
  TabsContents,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Edit3 } from "@/components/ui/icons";
import { StepWrapper } from '../shared/StepWrapper'
import { PromptConfigStepProps } from '../shared/types'

export function TabbedPromptConfigStep({
  data,
  onChange,
  isLoading = false,
  validation,
  onBlur,
  mode = 'add'
}: PromptConfigStepProps & { mode?: 'add' | 'edit' }) {
  const isClassification = data.promptCategory === 'classification'
  
  if (isClassification) {
    return (
      <StepWrapper 
        icon={Edit3} 
        title="Document Auto-Format Rules" 
        description="Configure when to apply 'Don't Translate' and 'Include English' options"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="skipTranslationRules">Skip Translations</Label>
            <Textarea
              id="skipTranslationRules"
              value={data.skipTranslationRules}
              onChange={(e) => onChange({ skipTranslationRules: e.target.value })}
              placeholder="Describe text segments to be tagged for skipping translation (e.g., 'Administrative forms, legal disclaimers, internal codes...')"
              rows={3}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Define criteria for content that should remain untranslated
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="includeEnglishRules">Include English</Label>
            <Textarea
              id="includeEnglishRules"
              value={data.includeEnglishRules}
              onChange={(e) => onChange({ includeEnglishRules: e.target.value })}
              placeholder="Describe text segments to be tagged to include original English text (e.g., 'Technical terms, brand names, specific measurements...')"
              rows={3}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Define rules for when to append original English text to translations
            </p>
          </div>
        </div>
      </StepWrapper>
    )
  }

  return (
    <StepWrapper 
      icon={Edit3} 
      title="Translation Customization" 
      description="Customize your translation prompt with specific guidance"
    >
      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="basic">Basic</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>

        <TabsContents>
        <TabsContent value="basic" className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="serviceDescription">Service Description</Label>
            <Input
              id="serviceDescription"
              value={data.serviceDescription}
              onChange={(e) => onChange({ serviceDescription: e.target.value })}
              onBlur={() => onBlur?.('serviceDescription')}
              placeholder="You are a translation service..."
              disabled={isLoading}
              className={`${validation?.showValidation && validation?.errors?.serviceDescription ? 'border-destructive' : ''}`}
            />
            <p className="text-xs text-muted-foreground">
              Describe the AI's role and purpose
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="translationApproach">Translation Approach</Label>
            <Input
              id="translationApproach"
              value={data.translationApproach}
              onChange={(e) => onChange({ translationApproach: e.target.value })}
              onBlur={() => onBlur?.('translationApproach')}
              placeholder="using closest natural equivalent..."
              disabled={isLoading}
              className={`${validation?.showValidation && validation?.errors?.translationApproach ? 'border-destructive' : ''}`}
            />
            <p className="text-xs text-muted-foreground">
              Define how translations should be approached
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contextGuidance">Context Guidance</Label>
            <Input
              id="contextGuidance"
              value={data.contextGuidance}
              onChange={(e) => onChange({ contextGuidance: e.target.value })}
              onBlur={() => onBlur?.('contextGuidance')}
              placeholder="In food pantry contexts..."
              disabled={isLoading}
              className={`${validation?.showValidation && validation?.errors?.contextGuidance ? 'border-destructive' : ''}`}
            />
            <p className="text-xs text-muted-foreground">
              Provide context-specific guidance
            </p>
          </div>
        </TabsContent>

        <TabsContent value="advanced" className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="additionalGuidance">Additional Guidance (Optional)</Label>
            <Textarea
              id="additionalGuidance"
              value={data.additionalGuidance}
              onChange={(e) => onChange({ additionalGuidance: e.target.value })}
              onBlur={() => onBlur?.('additionalGuidance')}
              placeholder="Any extra instructions..."
              rows={3}
              disabled={isLoading}
              className={`${validation?.showValidation && validation?.errors?.additionalGuidance ? 'border-destructive' : ''}`}
            />
            <p className="text-xs text-muted-foreground">
              Any additional instructions or constraints
            </p>
          </div>
        </TabsContent>
        </TabsContents>
      </Tabs>
    </StepWrapper>
  )
}
