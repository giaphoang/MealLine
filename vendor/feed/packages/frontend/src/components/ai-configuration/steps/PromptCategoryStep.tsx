// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React, { useRef } from 'react'
import { Card } from "@/components/ui/card"
import { AnimateIcon } from "@/components/animate-ui/icons/icon"
import { LanguagesIcon } from "@/components/animate-ui/icons/languages"
import { MessageSquareMoreIcon } from "@/components/animate-ui/icons/message-square-more"
import { MessageSquareQuoteIcon } from "@/components/animate-ui/icons/message-square-quote"
import { BlocksIcon } from "@/components/animate-ui/icons/blocks"
import { FileTextIcon, type FileTextIconHandle } from "@/components/ui/file-text"
import { StepWrapper } from '../shared/StepWrapper'
import { PromptCategoryStepProps, PromptCategory } from '../shared/types'

// Prompt Categories
const PROMPT_CATEGORIES: PromptCategory[] = [
  {
    id: 'food_translation',
    name: 'Food Items & Categories Translation',
    description: 'Instructions for translating inventory database entries (food items, category names)',
    icon: LanguagesIcon as PromptCategory['icon']
  },
  {
    id: 'custom_translation',
    name: 'Custom Text Translation',
    description: 'Instructions for translating user-generated content and administrative text',
    icon: MessageSquareMoreIcon as PromptCategory['icon']
  },
  {
    id: 'batch_translation',
    name: 'Document Text Translation',
    description: 'Instructions for translating text segments extracted from DOCX files',
    icon: FileTextIcon as PromptCategory['icon']
  },
  {
    id: 'classification',
    name: 'Document Auto-Format Rules',
    description: 'Configure when to apply "Don\'t Translate" and "Include English" options based on content analysis',
    icon: BlocksIcon as PromptCategory['icon']
  }
]

export function PromptCategoryStep({
  data,
  onChange,
  isLoading = false
}: PromptCategoryStepProps) {
  // FileTextIcon (Document Text Translation) is an imperative-ref
  // (lucide-animated) icon that the native AnimateIcon context can't drive;
  // a ref puts it in controlled mode so the Card's hover animates it (#35).
  const fileTextIconRef = useRef<FileTextIconHandle>(null)
  return (
    <StepWrapper
      icon={MessageSquareQuoteIcon as React.ComponentType<{ className?: string; size?: number }>}
      title="Prompt Category"
      description="Select the category that best fits your prompt purpose"
    >
      <div className="grid grid-cols-1 gap-2">
        {PROMPT_CATEGORIES.map((category) => {
          const IconComponent = category.icon
          // The other three icons are native animate-ui (driven by the
          // AnimateIcon wrapper); only this one is imperative-ref and needs
          // ref-driven hover (see fileTextIconRef above, ISSUES.md #35).
          const isImperativeIcon = category.id === 'batch_translation'
          return (
            <AnimateIcon
              key={category.id}
              asChild
              animateOnView
              animateOnViewOnce
              animateOnHover
              animateOnTap
            >
              <Card
                className={`cursor-pointer transition-all hover:border-primary p-3 ${
                  data.promptCategory === category.id ? 'border-primary bg-primary/5' : ''
                }`}
                onClick={() => onChange({ promptCategory: category.id })}
                onMouseEnter={isImperativeIcon ? () => fileTextIconRef.current?.startAnimation() : undefined}
                onMouseLeave={isImperativeIcon ? () => fileTextIconRef.current?.stopAnimation() : undefined}
              >
                <div className="flex items-start space-x-3">
                  {isImperativeIcon ? (
                    <FileTextIcon ref={fileTextIconRef} className="h-5 w-5 text-primary mt-0.5 shrink-0" size={20} />
                  ) : (
                    <IconComponent className="h-5 w-5 text-primary mt-0.5 shrink-0" size={20} />
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-foreground mb-1">{category.name}</h4>
                    <p className="text-xs text-muted-foreground">
                      {category.description}
                    </p>
                  </div>
                </div>
              </Card>
            </AnimateIcon>
          )
        })}
      </div>
    </StepWrapper>
  )
}
