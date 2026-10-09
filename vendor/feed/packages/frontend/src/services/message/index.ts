// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { ToastAction } from '@/components/ui/toast'
import { toast } from '@/components/ui/use-toast'
import React from 'react'
import type { MessageType, MessageOptions } from './types'
import { computeMessageDuration, DEFAULT_TITLES, VARIANT_MAPPINGS } from './types'
import { linkifyMessage } from './linkify'

/**
 * How long an identical message is treated as the same event.
 *
 * Long enough to catch the real cause — several components independently
 * reporting one underlying failure — and short enough that a user who
 * genuinely repeats an action still gets feedback for it.
 */
export const DUPLICATE_MESSAGE_WINDOW_MS = 3000

class MessageService {
  /** Recently shown messages, keyed by type and text, with their live handle. */
  private recent = new Map<string, { at: number; handle: ReturnType<typeof toast> }>()

  /**
   * True when this exact message was just shown.
   *
   * One failure often has several witnesses. Three components subscribe to the
   * alert stream, and each raised its own toast for a single dropped
   * connection, so the user saw the same sentence stacked twice or three times.
   * Fixing it at each call site fixes it once; collapsing identical messages
   * here fixes the shape of the problem wherever it appears.
   *
   * Deliberately keyed on the text and type rather than on a caller identity:
   * what makes two toasts redundant is that they say the same thing at the same
   * moment, whoever raised them.
   */
  private recentKey(message: string, type: MessageType) {
    return `${type}:${message}`
  }

  private show(message: string, type: MessageType, options?: MessageOptions) {
    const key = this.recentKey(message, type)
    const now = Date.now()
    const seen = this.recent.get(key)
    if (seen && now - seen.at < DUPLICATE_MESSAGE_WINDOW_MS) {
      // The live handle for the toast already on screen, so a caller that
      // dismisses or updates its "own" toast still works and never learns it
      // was collapsed into someone else's.
      return seen.handle
    }
    // Opportunistic sweep; the map only ever holds recent, distinct messages.
    if (this.recent.size > 50) {
      for (const [k, entry] of this.recent) {
        if (now - entry.at > DUPLICATE_MESSAGE_WINDOW_MS) this.recent.delete(k)
      }
    }
    // Length-aware default (ISSUES.md #44): scale the on-screen time with how
    // much there is to read. An explicit options.duration still wins.
    const duration = options?.duration ?? computeMessageDuration(message)
    const title = DEFAULT_TITLES[type]

    // Forward reference to the toast's dismiss(), populated below. Clicking an
    // embedded action button runs the user's handler and then closes the toast
    // (ISSUES.md #44: action clicks are an explicit close, like the X button).
    let dismissToast: (() => void) | undefined
    const actionComponent = options?.action ? React.createElement(
      ToastAction,
      {
        altText: options.action.label,
        onClick: () => {
          options.action!.onClick()
          dismissToast?.()
        }
      },
      options.action.label
    ) : undefined

    const handle = toast({
      title,
      // Rendered, not raw: a message that names a URL gets a clickable link.
      // The de-duplication key and the length-aware duration above both stay
      // on the plain string, so linking changes what is shown and nothing
      // about how the toast behaves.
      description: linkifyMessage(message),
      variant: VARIANT_MAPPINGS[type],
      duration: options?.persist ? null : duration,
      action: actionComponent
    })
    dismissToast = handle.dismiss
    this.recent.set(key, { at: now, handle })
    return handle
  }

  /**
   * Creates a progress toast that can be updated during long-running operations
   * Returns an object with update and dismiss methods
   */
  progress(initialMessage: string, type: MessageType = 'info') {
    const progressToast = this.show(initialMessage, type, { 
      duration: 30000 // Longer duration for progress
    })
    
    return {
      update: (message: string, newType?: MessageType) => {
        progressToast.update({
          title: DEFAULT_TITLES[newType || type],
          description: linkifyMessage(message),
          variant: VARIANT_MAPPINGS[newType || type]
        })
      },
      dismiss: () => progressToast.dismiss()
    }
  }

  success(message: string, options?: MessageOptions) {
    this.show(message, 'success', options)
  }

  error(message: string, options?: MessageOptions) {
    this.show(message, 'error', options)
  }

  info(message: string, options?: MessageOptions) {
    this.show(message, 'info', options)
  }

  warning(message: string, options?: MessageOptions) {
    this.show(message, 'warning', options)
  }

  retryableError(message: string, onRetry: () => void) {
    this.error(message, {
      persist: true,
      action: {
        label: 'Retry',
        onClick: onRetry
      }
    })
  }

  systemError(message: string = 'An unexpected error occurred') {
    this.error(message, {
      persist: true,
      action: {
        label: 'Reload',
        onClick: () => window.location.reload()
      }
    })
  }
}

export const messageService = new MessageService()