// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useState, useEffect, useCallback } from 'react'
import { AIConfigService } from '@/services/ai-config'

interface SystemStatus {
  initialized: boolean
  components: {
    encryptionKey: boolean
  }
}

interface UseSystemStatusReturn {
  status: SystemStatus | null
  isLoading: boolean
  error: string | null
  checkStatus: () => Promise<void>
  clearCache: () => void
}

/**
 * Hook for managing system status with caching and proactive checking
 * Enables preemptive routing to setup wizard before configuration attempts
 */
export function useSystemStatus(): UseSystemStatusReturn {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastCheck, setLastCheck] = useState<number>(0)
  
  // Cache duration: 5 minutes
  const CACHE_DURATION = 5 * 60 * 1000

  const checkStatus = useCallback(async () => {
    const now = Date.now()
    
    // Return cached status if within cache duration
    if (status && (now - lastCheck) < CACHE_DURATION) {
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const aiConfigService = new AIConfigService()
      const systemStatus = await aiConfigService.getSystemStatus()
      
      setStatus(systemStatus)
      setLastCheck(now)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to check system status'
      setError(errorMessage)
      
      // Set status to uninitialized on error to trigger setup
      setStatus({ 
        initialized: false, 
        components: { encryptionKey: false } 
      })
    } finally {
      setIsLoading(false)
    }
  }, [status, lastCheck])

  const clearCache = useCallback(() => {
    setStatus(null)
    setLastCheck(0)
    setError(null)
  }, [])

  // Check status on mount
  useEffect(() => {
    checkStatus()
  }, [checkStatus])

  return {
    status,
    isLoading,
    error,
    checkStatus,
    clearCache
  }
}
