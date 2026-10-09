// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React from 'react'
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DollarSign } from "@/components/ui/icons";
import { StepWrapper } from '../shared/StepWrapper'
import { CostStepProps } from '../shared/types'
import { createCurrencyChangeHandler } from '../shared/formatting'

interface CostStepState {
  rawInputCost: string
  rawOutputCost: string
  inputCostAtLimit: boolean
  outputCostAtLimit: boolean
}

export function CostStep({
  mode,
  data,
  onChange,
  isLoading = false,
  validation,
  onBlur
}: CostStepProps) {
  const [state, setState] = React.useState<CostStepState>({
    rawInputCost: data.inputCost?.toString() || '',
    rawOutputCost: data.outputCost?.toString() || '',
    inputCostAtLimit: false,
    outputCostAtLimit: false
  })

  const showError = (message: string) => {
    // Handle error display - could be passed as prop or use toast
    console.error(message)
  }

  const setInputCostAtLimit = (atLimit: boolean) => {
    setState(prev => ({ ...prev, inputCostAtLimit: atLimit }))
  }

  const setOutputCostAtLimit = (atLimit: boolean) => {
    setState(prev => ({ ...prev, outputCostAtLimit: atLimit }))
  }

  const setRawInputCost = (value: string) => {
    setState(prev => ({ ...prev, rawInputCost: value }))
  }

  const setRawOutputCost = (value: string) => {
    setState(prev => ({ ...prev, rawOutputCost: value }))
  }

  return (
    <StepWrapper 
      icon={DollarSign} 
      title="Cost Tracking" 
      description={mode === 'add' ? 'Set pricing information for cost calculations' : 'Update pricing information for cost calculations'}
    >
      <div className="space-y-2">
        <Label htmlFor="unitPrice">Unit Price</Label>
        <Select 
          value={data.unitPrice || 'per_1m'} 
          onValueChange={(value: 'per_1k' | 'per_1m') => onChange({ unitPrice: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="per_1k">Per 1K tokens</SelectItem>
            <SelectItem value="per_1m">Per 1M tokens</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="inputCost">Input Rate</Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
          <Input
            id="inputCost"
            type="text"
            value={state.rawInputCost}
            onChange={createCurrencyChangeHandler('inputCost', setRawInputCost, onChange, setInputCostAtLimit, setOutputCostAtLimit, showError)}
            placeholder="Cost per unit (8 decimal precision)"
            className="pl-8"
            disabled={isLoading}
          />
        </div>
        <p className={`text-xs ${state.inputCostAtLimit ? 'cost-limit-warning' : 'text-muted-foreground'}`}>
          Leave empty to skip cost tracking. Maximum: $10,000.00
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="outputCost">Output Rate</Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
          <Input
            id="outputCost"
            type="text"
            value={state.rawOutputCost}
            onChange={createCurrencyChangeHandler('outputCost', setRawOutputCost, onChange, setInputCostAtLimit, setOutputCostAtLimit, showError)}
            placeholder="Cost per unit (8 decimal precision)"
            className="pl-8"
            disabled={isLoading}
          />
        </div>
        <p className={`text-xs ${state.outputCostAtLimit ? 'cost-limit-warning' : 'text-muted-foreground'}`}>
          Leave empty to skip cost tracking. Maximum: $10,000.00
        </p>
      </div>
    </StepWrapper>
  )
}
