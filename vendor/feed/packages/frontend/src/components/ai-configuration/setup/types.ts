// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Setup wizard types and interfaces
 */

export type SetupStep = 'welcome' | 'keygen' | 'validation' | 'complete'

export interface SetupState {
  setupStep: SetupStep
  generatedKey: string | null
  isInitializing: boolean
  initializationError: string | null
}

export interface SetupWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: () => void
  preserveConfigData?: boolean
}

export interface SetupStepProps {
  setupState: SetupState
  onNext: () => void
  onBack: () => void
  onGenerateKey: () => Promise<void>
  onInitializeSystem: () => Promise<void>
}
