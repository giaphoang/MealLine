// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React from 'react'
import { ConfigData } from './types'

/**
 * Formats currency input with commas and enforces $10,000 maximum
 */
export const formatCurrencyInput = (value: string): string => {
  if (!value) return ''
  // Remove all non-numeric characters except decimal point
  const cleaned = value.replace(/[^\d.]/g, '')
  // Ensure only one decimal point
  const parts = cleaned.split('.')
  if (parts.length > 2) {
    const wholePart = parts[0]
    const decimalPart = parts.slice(1).join('')
    return wholePart + '.' + decimalPart
  }
  
  // Enforce $10,000 maximum immediately
  let finalValue = parts.length === 2 ? parts[0] + '.' + parts[1] : parts[0]
  const numericValue = parseFloat(finalValue.replace(/,/g, ''))
  if (numericValue > 10000) {
    finalValue = '10000'
  }
  
  // Add comma formatting for values >= 1,000
  const [whole, decimal] = finalValue.split('.')
  if (decimal !== undefined) {
    const formattedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return formattedWhole + '.' + decimal
  } else {
    return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }
}

/**
 * Parses currency value from formatted string
 */
export const parseCurrencyValue = (value: string): number | undefined => {
  if (!value) return undefined
  // Remove commas before parsing
  const cleaned = value.replace(/,/g, '')
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? undefined : Math.min(parsed, 10000)
}

/**
 * Formats number input with commas and enforces 1 billion maximum
 */
export const formatNumberInput = (value: string): string => {
  if (!value) return ''
  // Remove all non-numeric characters
  const cleaned = value.replace(/\D/g, '')
  // Ensure maximum is 1 billion
  const num = parseInt(cleaned)
  let finalValue = cleaned
  if (num > 1000000000) {
    finalValue = '1000000000'
  }
  // Add commas for thousands separation
  return finalValue.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * Parses number value from formatted string
 */
export const parseNumberValue = (value: string): number | undefined => {
  if (!value) return undefined
  const cleaned = value.replace(/,/g, '')
  const parsed = parseInt(cleaned)
  return isNaN(parsed) ? undefined : Math.min(parsed, 1000000000)
}

/**
 * Formats cost limit input with commas, enforces $10,000 maximum, and limits to 2 decimal places
 */
export const formatCostLimitInput = (value: string): string => {
  if (!value) return ''
  // Remove all non-numeric characters except decimal point
  const cleaned = value.replace(/[^\d.]/g, '')
  // Ensure only one decimal point
  const parts = cleaned.split('.')
  if (parts.length > 2) {
    const wholePart = parts[0]
    const decimalPart = parts.slice(1).join('')
    return wholePart + '.' + decimalPart
  }
  
  // Limit decimal places to 2
  let finalValue = parts[0]
  if (parts.length === 2) {
    const decimalPart = parts[1].slice(0, 2) // Enforce max 2 decimal places
    finalValue = parts[0] + '.' + decimalPart
  }
  
  // Enforce $10,000 maximum
  const numericValue = parseFloat(finalValue.replace(/,/g, ''))
  if (numericValue > 10000) {
    finalValue = '10000.00'
  }
  
  // Add comma formatting for values >= 1,000
  const [whole, decimal] = finalValue.split('.')
  if (decimal !== undefined) {
    const formattedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return formattedWhole + '.' + decimal
  } else {
    return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }
}

/**
 * Creates cost limit change handler for input fields (2 decimal places max)
 */
export const createCostLimitChangeHandler = (
  field: 'dailyCostLimit' | 'monthlyCostLimit',
  setRaw: (value: string) => void,
  onChange: (updates: Partial<ConfigData>) => void,
  setDailyCostAtLimit?: (value: boolean) => void,
  setMonthlyCostAtLimit?: (value: boolean) => void,
  showError?: (message: string) => void
) => (e: React.ChangeEvent<HTMLInputElement>) => {
  const originalValue = e.target.value
  const formatted = formatCostLimitInput(originalValue)
  setRaw(formatted)
  
  // Check if limit was exceeded
  const numericValue = parseFloat(originalValue.replace(/[^\d.]/g, '')) || 0
  const limitExceeded = numericValue > 10000
  
  if (limitExceeded && showError) {
    showError('Maximum cost limit is $10,000.00')
  }
  
  // Update limit state
  const atLimit = formatted === '10,000' || formatted.startsWith('10,000.')
  if (field === 'dailyCostLimit' && setDailyCostAtLimit) {
    setDailyCostAtLimit(atLimit)
  } else if (field === 'monthlyCostLimit' && setMonthlyCostAtLimit) {
    setMonthlyCostAtLimit(atLimit)
  }
  
  const finalNumericValue = parseCurrencyValue(formatted)
  const resolvedValue = finalNumericValue === undefined || finalNumericValue === 0
    ? null
    : finalNumericValue
  onChange({ [field]: resolvedValue })
}

/**
 * Creates currency change handler for input fields
 */
export const createCurrencyChangeHandler = (
  field: 'inputCost' | 'outputCost',
  setRaw: (value: string) => void,
  onChange: (updates: Partial<ConfigData>) => void,
  setInputCostAtLimit?: (value: boolean) => void,
  setOutputCostAtLimit?: (value: boolean) => void,
  showError?: (message: string) => void
) => (e: React.ChangeEvent<HTMLInputElement>) => {
  const originalValue = e.target.value
  const formatted = formatCurrencyInput(originalValue)
  setRaw(formatted)
  
  // Check if limit was exceeded
  const numericValue = parseFloat(originalValue.replace(/[^\d.]/g, '')) || 0
  const limitExceeded = numericValue > 10000
  
  if (limitExceeded && showError) {
    showError('Maximum cost limit is $10,000.00')
  }
  
  // Update limit state
  const atLimit = formatted === '10,000' || formatted.startsWith('10,000.')
  if (field === 'inputCost' && setInputCostAtLimit) {
    setInputCostAtLimit(atLimit)
  } else if (field === 'outputCost' && setOutputCostAtLimit) {
    setOutputCostAtLimit(atLimit)
  }
  
  const finalNumericValue = parseCurrencyValue(formatted)
  const resolvedValue = finalNumericValue === undefined ? null : finalNumericValue
  onChange({ [field]: resolvedValue })
}

/**
 * Creates token limit change handler for input fields
 */
export const createTokenLimitChangeHandler = (
  field: 'inputTokenLimit' | 'outputTokenLimit',
  setRaw: (value: string) => void,
  onChange: (updates: Partial<ConfigData>) => void
) => (e: React.ChangeEvent<HTMLInputElement>) => {
  const formatted = formatNumberInput(e.target.value)
  setRaw(formatted)
  const numericValue = parseNumberValue(formatted)
  const resolvedValue = numericValue === undefined ? null : numericValue
  onChange({ [field]: resolvedValue })
}

/**
 * Creates number change handler for input fields
 */
export const createNumberChangeHandler = (
  field: 'tokensPerMinute' | 'requestsPerMinute' | 'requestsPerDay',
  setRaw: (value: string) => void,
  onChange: (updates: Partial<ConfigData>) => void
) => (e: React.ChangeEvent<HTMLInputElement>) => {
  const formatted = formatNumberInput(e.target.value)
  setRaw(formatted)
  const numericValue = parseNumberValue(formatted)
  const resolvedValue = numericValue === undefined ? null : numericValue
  onChange({ [field]: resolvedValue })
}
