// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useState, useEffect } from 'react'
import { TranslationService } from '@/services/translation'

interface PerformanceData {
  date: string
  responseTime: number // in milliseconds
  cost: number // in USD
  promptTokens: number
  completionTokens: number
}

const translationService = new TranslationService()

export function useTranslationPerformance(timeRange: string) {
  const [data, setData] = useState<PerformanceData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        setIsLoading(true)
        const metrics = await translationService.getPerformanceMetrics(timeRange)
        setData(metrics)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch performance metrics'))
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [timeRange])

  return { data, isLoading, error }
}

// Mock data kept for reference during development
/* const mockData: PerformanceData[] = [
  { date: '2024-02-01', responseTime: 1200, cost: 0.15, promptTokens: 150, completionTokens: 100 },
  { date: '2024-02-02', responseTime: 1100, cost: 0.12, promptTokens: 120, completionTokens: 80 },
  { date: '2024-02-03', responseTime: 1300, cost: 0.18, promptTokens: 180, completionTokens: 120 },
  { date: '2024-02-04', responseTime: 1000, cost: 0.10, promptTokens: 100, completionTokens: 70 },
  { date: '2024-02-05', responseTime: 1400, cost: 0.20, promptTokens: 200, completionTokens: 150 },
  { date: '2024-02-06', responseTime: 1250, cost: 0.16, promptTokens: 160, completionTokens: 110 },
  { date: '2024-02-07', responseTime: 1150, cost: 0.14, promptTokens: 140, completionTokens: 90 }
] */