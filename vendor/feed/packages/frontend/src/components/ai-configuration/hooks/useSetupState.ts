// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useState } from 'react'
import { useMessage } from '@/hooks/message/useMessage'
import { AIConfigService } from '@/services/ai-config'
import { SetupState, SetupStep } from '../types'
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService'

/**
 * Custom hook for managing setup wizard state and operations
 */
export function useSetupState() {
  const { showMessage, showError } = useMessage()
  
  const [setupState, setSetupState] = useState<SetupState>({
    setupStep: 'welcome',
    generatedKey: null,
    isInitializing: false,
    initializationError: null
  })

  const generateEncryptionKey = async (): Promise<string> => {
    try {
      const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      )
      const exported = await crypto.subtle.exportKey('raw', key)
      return btoa(String.fromCharCode(...new Uint8Array(exported)))
    } catch (error) {
      console.error('Key generation failed:', error)
      throw new Error('Failed to generate encryption key')
    }
  }

  const handleGenerateKey = async () => {
    setSetupState(prev => ({ ...prev, isInitializing: true, initializationError: null }))
    try {
      const key = await generateEncryptionKey()
      setSetupState(prev => ({ ...prev, generatedKey: key, isInitializing: false }))
      showMessage('Encryption key generated successfully', 'success')
    } catch (error) {
      setSetupState(prev => ({ 
        ...prev, 
        isInitializing: false, 
        initializationError: error instanceof Error ? error.message : 'Key generation failed'
      }))
      ErrorHandlerService.handleError(error, 'generateEncryptionKey')
    }
  }

  const handleInitializeSystem = async () => {
    if (!setupState.generatedKey) return
    
    setSetupState(prev => ({ ...prev, isInitializing: true, initializationError: null }))
    
    try {
      const aiConfigService = new AIConfigService()
      await aiConfigService.initializeSystem(setupState.generatedKey)
      
      setSetupState(prev => ({ ...prev, isInitializing: false }))
      showMessage('System initialized successfully', 'success')
      handleNext()
    } catch (error) {
      setSetupState(prev => ({ 
        ...prev, 
        isInitializing: false, 
        initializationError: error instanceof Error ? error.message : 'Initialization failed'
      }))
      ErrorHandlerService.handleError(error, 'initializeSystem')
    }
  }

  const handleNext = () => {
    switch (setupState.setupStep) {
      case 'welcome':
        setSetupState(prev => ({ ...prev, setupStep: 'keygen' }))
        break
      case 'keygen':
        setSetupState(prev => ({ ...prev, setupStep: 'validation' }))
        break
      case 'validation':
        setSetupState(prev => ({ ...prev, setupStep: 'complete' }))
        break
    }
  }

  const handleBack = () => {
    switch (setupState.setupStep) {
      case 'keygen':
        setSetupState(prev => ({ ...prev, setupStep: 'welcome' }))
        break
      case 'validation':
        setSetupState(prev => ({ ...prev, setupStep: 'keygen' }))
        break
      case 'complete':
        setSetupState(prev => ({ ...prev, setupStep: 'validation' }))
        break
    }
  }

  const reset = () => {
    setSetupState({
      setupStep: 'welcome',
      generatedKey: null,
      isInitializing: false,
      initializationError: null
    })
  }

  return {
    setupState,
    handleNext,
    handleBack,
    handleGenerateKey,
    handleInitializeSystem,
    reset
  }
}
