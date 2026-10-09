// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React from 'react'
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Gauge } from "@/components/ui/icons";
import { StepWrapper } from '../shared/StepWrapper'
import { TokenLimitsStepProps } from '../shared/types'
import { createTokenLimitChangeHandler } from '../shared/formatting'

interface TokenLimitsState {
  rawInputTokenLimit: string
  rawOutputTokenLimit: string
}

export function TokenLimitsStep({
  mode,
  data,
  onChange,
  isLoading = false,
  validation,
  onBlur
}: TokenLimitsStepProps) {
  const [state, setState] = React.useState<TokenLimitsState>({
    rawInputTokenLimit: data.inputTokenLimit?.toLocaleString() || '',
    rawOutputTokenLimit: data.outputTokenLimit?.toLocaleString() || ''
  })

  const setRawInputTokenLimit = (value: string) => {
    setState(prev => ({ ...prev, rawInputTokenLimit: value }))
  }

  const setRawOutputTokenLimit = (value: string) => {
    setState(prev => ({ ...prev, rawOutputTokenLimit: value }))
  }

  return (
    <StepWrapper 
      icon={Gauge} 
      title="Token Limits" 
      description="Configure input and output token limits"
    >
      <div className="space-y-2">
        <Label htmlFor="inputTokenLimit">Input Token Limit</Label>
        <Input
          id="inputTokenLimit"
          type="text"
          value={state.rawInputTokenLimit}
          onChange={createTokenLimitChangeHandler('inputTokenLimit', setRawInputTokenLimit, onChange)}
          placeholder="Maximum input tokens (e.g., 1,000,000)"
          disabled={isLoading}
        />
        <p className="text-xs text-muted-foreground">
          Maximum tokens for input context. Leave empty for unlimited.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="outputTokenLimit">Output Token Limit</Label>
        <Input
          id="outputTokenLimit"
          type="text"
          value={state.rawOutputTokenLimit}
          onChange={createTokenLimitChangeHandler('outputTokenLimit', setRawOutputTokenLimit, onChange)}
          placeholder="Maximum output tokens (e.g., 32,768)"
          disabled={isLoading}
        />
        <p className="text-xs text-muted-foreground">
          Maximum tokens for response generation. Leave empty for unlimited.
        </p>
      </div>
    </StepWrapper>
  )
}
