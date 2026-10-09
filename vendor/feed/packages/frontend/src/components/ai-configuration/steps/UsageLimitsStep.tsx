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
import { UsageLimitsStepProps } from '../shared/types'
import { createNumberChangeHandler } from '../shared/formatting'

interface UsageLimitsState {
  rawTokensPerMinute: string
  rawRequestsPerMinute: string
  rawRequestsPerDay: string
}

export function UsageLimitsStep({
  mode,
  data,
  onChange,
  isLoading = false,
  validation,
  onBlur
}: UsageLimitsStepProps) {
  const [state, setState] = React.useState<UsageLimitsState>({
    rawTokensPerMinute: data.tokensPerMinute?.toLocaleString() || '',
    rawRequestsPerMinute: data.requestsPerMinute?.toLocaleString() || '',
    rawRequestsPerDay: data.requestsPerDay?.toLocaleString() || ''
  })

  const setRawTokensPerMinute = (value: string) => {
    setState(prev => ({ ...prev, rawTokensPerMinute: value }))
  }

  const setRawRequestsPerMinute = (value: string) => {
    setState(prev => ({ ...prev, rawRequestsPerMinute: value }))
  }

  const setRawRequestsPerDay = (value: string) => {
    setState(prev => ({ ...prev, rawRequestsPerDay: value }))
  }

  return (
    <StepWrapper 
      icon={Gauge} 
      title="Provider Allowances"
      description={mode === 'add' ? 'Record the allowances on this provider account' : 'Update the recorded provider allowances'}
    >
      <div className="space-y-2">
        <Label htmlFor="tokensPerMinute">Tokens Per Minute</Label>
        <Input
          id="tokensPerMinute"
          type="text"
          value={state.rawTokensPerMinute}
          onChange={createNumberChangeHandler('tokensPerMinute', setRawTokensPerMinute, onChange)}
          placeholder="Token rate limit (e.g., 30,000)"
          disabled={isLoading}
        />
        <p className="text-xs text-muted-foreground">
          Provider or account allowance used for monitoring. Leave empty when unknown.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="requestsPerMinute">Requests Per Minute</Label>
        <Input
          id="requestsPerMinute"
          type="text"
          value={state.rawRequestsPerMinute}
          onChange={createNumberChangeHandler('requestsPerMinute', setRawRequestsPerMinute, onChange)}
          placeholder="Request rate limit (e.g., 500)"
          disabled={isLoading}
        />
        <p className="text-xs text-muted-foreground">
          Provider or account allowance used for monitoring. Leave empty when unknown.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="requestsPerDay">Requests Per Day</Label>
        <Input
          id="requestsPerDay"
          type="text"
          value={state.rawRequestsPerDay}
          onChange={createNumberChangeHandler('requestsPerDay', setRawRequestsPerDay, onChange)}
          placeholder="Daily request limit (e.g., 10,000)"
          disabled={isLoading}
        />
        <p className="text-xs text-muted-foreground">
          Provider or account allowance used for monitoring. Leave empty when unknown.
        </p>
      </div>
    </StepWrapper>
  )
}
