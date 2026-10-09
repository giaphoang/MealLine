// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Shield, Settings, CheckCircle, Key } from "@/components/ui/icons";
import { SetupWizardProps } from './types'
import { useSetupState } from '../hooks/useSetupState'

/**
 * Initial setup wizard for first-time encryption key generation and system initialization
 * Separated from main add dialog to enable proactive checking and cleaner architecture
 */
export function InitialSetupWizard({ 
  open, 
  onOpenChange, 
  onComplete,
  preserveConfigData = false 
}: SetupWizardProps) {
  const {
    setupState,
    handleNext,
    handleBack,
    handleGenerateKey,
    handleInitializeSystem,
    reset
  } = useSetupState()

  const handleClose = (open: boolean) => {
    if (!open) {
      reset()
    }
    onOpenChange(open)
  }

  const handleSetupComplete = () => {
    onComplete()
    handleClose(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>System Setup Required</DialogTitle>
          <DialogDescription>
            {setupState.setupStep === 'welcome' && 'One-time system initialization required before AI configuration'}
            {setupState.setupStep === 'keygen' && 'Generate encryption key for secure data storage'}
            {setupState.setupStep === 'validation' && 'Initialize system with generated encryption key'}
            {setupState.setupStep === 'complete' && 'System setup completed successfully'}
          </DialogDescription>
        </DialogHeader>

        {/* Welcome Step */}
        {setupState.setupStep === 'welcome' && (
          <div className="space-y-4">
            <div className="text-center">
              <Shield className="h-12 w-12 mx-auto text-muted-foreground" />
              <h3 className="mt-2 text-lg font-medium">System Setup Required</h3>
              <p className="text-sm text-muted-foreground mb-4">
                One-time initialization required for secure AI configuration storage
              </p>
            </div>

            <div className="space-y-4">
              <div className="p-4 translation-options-column rounded-lg">
                <h4 className="text-sm font-medium mb-2">Security Information</h4>
                <p className="text-xs text-muted-foreground mb-2">
                  This system uses client-side encryption to protect API keys and sensitive configuration data.
                  A unique encryption key will be generated in your browser and transmitted securely to initialize the system.
                </p>
                <p className="text-xs text-muted-foreground">
                  The encryption key is never stored in browser memory or logs and is immediately transferred to secure server storage.
                </p>
              </div>

              <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <h4 className="text-sm font-medium text-primary mb-2">What happens next:</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Generate encryption key using Web Crypto API</li>
                  <li>• Initialize secure server storage</li>
                  <li>• Enable AI configuration features</li>
                  <li>• Complete your original configuration</li>
                </ul>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={handleNext}>
                Begin Setup
              </Button>
            </div>
          </div>
        )}

        {/* Key Generation Step */}
        {setupState.setupStep === 'keygen' && (
          <div className="space-y-4">
            <div className="text-center">
              <Key className="h-12 w-12 mx-auto text-muted-foreground" />
              <h3 className="mt-2 text-lg font-medium">Generate Encryption Key</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create a secure encryption key for protecting your AI configuration data
              </p>
            </div>

            <div className="space-y-4">
              {!setupState.generatedKey ? (
                <>
                  <div className="p-4 translation-options-column rounded-lg">
                    <h4 className="text-sm font-medium mb-2">Key Generation Process</h4>
                    <p className="text-xs text-muted-foreground mb-2">
                      A 256-bit AES-GCM encryption key will be generated using your browser's Web Crypto API.
                      This ensures the key is created securely without server involvement.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      The key generation process is cryptographically secure and cannot be reproduced or predicted.
                    </p>
                  </div>

                  <div className="flex justify-center">
                    <Button 
                      onClick={handleGenerateKey} 
                      disabled={setupState.isInitializing}
                      className="w-full"
                    >
                      {setupState.isInitializing ? 'Generating Key...' : 'Generate Encryption Key'}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                    <div className="flex items-center space-x-2 mb-2">
                      <CheckCircle className="h-4 w-4 text-primary" />
                      <h4 className="text-sm font-medium text-primary">Key Generated Successfully</h4>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">
                      Your encryption key has been generated and is ready for system initialization.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Key length: 256 bits | Algorithm: AES-GCM | Generated: {new Date().toLocaleTimeString()}
                    </p>
                  </div>

                  <div className="p-4 translation-options-column rounded-lg">
                    <h4 className="text-sm font-medium mb-2">Security Notice</h4>
                    <p className="text-xs text-muted-foreground">
                      The encryption key is stored securely in memory and will be transmitted to the server for 
                      initialization. It is never logged, cached, or stored in browser storage.
                    </p>
                  </div>
                </>
              )}

              {setupState.initializationError && (
                <div className="p-4 bg-destructive/5 border border-destructive/20 rounded-lg">
                  <h4 className="text-sm font-medium text-destructive mb-1">Key Generation Failed</h4>
                  <p className="text-xs text-muted-foreground">{setupState.initializationError}</p>
                </div>
              )}
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={handleBack}>
                Back
              </Button>
              <Button onClick={handleNext} disabled={!setupState.generatedKey}>
                Next
              </Button>
            </div>
          </div>
        )}

        {/* System Initialization Step */}
        {setupState.setupStep === 'validation' && (
          <div className="space-y-4">
            <div className="text-center">
              <Settings className="h-12 w-12 mx-auto text-muted-foreground" />
              <h3 className="mt-2 text-lg font-medium">Initialize System</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Transmit encryption key and configure secure server storage
              </p>
            </div>

            <div className="space-y-4">
              {!setupState.isInitializing ? (
                <>
                  <div className="p-4 translation-options-column rounded-lg">
                    <h4 className="text-sm font-medium mb-2">Initialization Process</h4>
                    <p className="text-xs text-muted-foreground mb-2">
                      The encryption key will be securely transmitted to the server and used to initialize 
                      the secure storage system for AI configurations.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      This process typically takes 2-3 seconds and cannot be reversed once completed.
                    </p>
                  </div>

                  <div className="flex justify-center">
                    <div className="w-full">
                      <Button 
                        onClick={handleInitializeSystem} 
                        className="w-full"
                      >
                        {setupState.initializationError ? 'Retry Initialization' : 'Initialize System'}
                      </Button>
                      {setupState.initializationError && (
                        <p className="text-sm text-destructive mt-2 text-center">
                          {setupState.initializationError}
                        </p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                  <div className="flex items-center space-x-2 mb-2">
                    <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                    <h4 className="text-sm font-medium text-primary">Initializing System...</h4>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Transmitting encryption key and configuring secure storage. Please wait.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={handleBack} disabled={setupState.isInitializing}>
                Back
              </Button>
            </div>
          </div>
        )}

        {/* Setup Complete Step */}
        {setupState.setupStep === 'complete' && (
          <div className="space-y-4">
            <div className="text-center">
              <CheckCircle className="h-12 w-12 mx-auto text-primary" />
              <h3 className="mt-2 text-lg font-medium text-primary">Setup Complete</h3>
              <p className="text-sm text-muted-foreground mb-4">
                System successfully initialized and ready for AI configuration
              </p>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <h4 className="text-sm font-medium text-primary mb-2">Initialization Summary</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Encryption key generated and stored securely</li>
                  <li>• Server storage system configured</li>
                  <li>• AI configuration features enabled</li>
                  <li>• System ready for normal operation</li>
                </ul>
              </div>

              <div className="p-4 translation-options-column rounded-lg">
                <h4 className="text-sm font-medium mb-2">Next Steps</h4>
                <p className="text-xs text-muted-foreground">
                  You can now proceed with creating your AI configuration. The system will securely encrypt 
                  and store your API keys and other sensitive configuration data.
                  {preserveConfigData && ' Your previous configuration data will be preserved.'}
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={handleSetupComplete}>
                Continue to Configuration
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
