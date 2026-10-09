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
import { Switch } from "@/components/ui/switch"
import { FileTextIcon } from "@/components/ui/file-text"
import { StepWrapper } from '../shared/StepWrapper'
import { NameStepProps } from '../shared/types'

export function NameStep({
  mode,
  data,
  onChange,
  isLoading = false,
  validation,
  onBlur,
  showActiveToggle = false,
  isActive = true,
  onActiveChange
}: NameStepProps) {
  return (
    <StepWrapper
      icon={FileTextIcon as React.ComponentType<{ className?: string; size?: number }>}
      title="Name & Description"
      description={mode === 'add' ? 'Name your configuration and add details' : 'Update configuration name and details'}
    >
      <div className="space-y-2">
        <Label htmlFor="name">Configuration Name</Label>
        <Input
          id="name"
          value={data.name || ''}
          onChange={(e) => onChange({ name: e.target.value })}
          onBlur={() => onBlur?.('name', 'name')}
          placeholder="Configuration name (3-100 characters)"
          maxLength={100}
          disabled={isLoading}
          className={`${validation?.showValidation && validation?.errors?.name ? 'border-destructive' : ''}`}
        />
        <div className="flex justify-between">
          <p className="text-xs text-muted-foreground">
            Unique identifier for this configuration
          </p>
          <p className="text-xs text-muted-foreground">
            {(data.name || '').length}/100 characters
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description (Optional)</Label>
        <Textarea
          id="description"
          value={data.description || ''}
          onChange={(e) => onChange({ description: e.target.value })}
          onBlur={() => onBlur?.('description')}
          placeholder="Optional notes about this configuration"
          rows={2}
          maxLength={500}
          disabled={isLoading}
          className={`${validation?.showValidation && validation?.errors?.description ? 'border-destructive' : ''}`}
        />
        <div className="flex justify-between">
          <p className="text-xs text-muted-foreground">
            Additional context or usage notes
          </p>
          <p className="text-xs text-muted-foreground">
            {(data.description || '').length}/500 characters
          </p>
        </div>
      </div>

      {showActiveToggle && (
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Active Status</Label>
            <p className="text-sm text-muted-foreground">
              Enable or disable this configuration
            </p>
          </div>
          <Switch
            checked={isActive}
            onCheckedChange={onActiveChange}
            disabled={isLoading}
          />
        </div>
      )}
    </StepWrapper>
  )
}
