// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useCallback } from 'react';
import { messageService } from '@/services/message';
import type { MessageType, MessageOptions } from '@/services/message/types';

/**
 * React hook for using the message service
 * Provides memoized functions for showing various types of messages
 */
export function useMessage() {
  const showMessage = useCallback((
    message: string,
    type: MessageType = 'info',
    options?: MessageOptions
  ) => {
    messageService.show(message, type, options);
  }, []);

  const showSuccess = useCallback((
    message: string,
    options?: MessageOptions
  ) => {
    messageService.success(message, options);
  }, []);

  const showError = useCallback((
    message: string,
    options?: MessageOptions
  ) => {
    messageService.error(message, options);
  }, []);

  const showInfo = useCallback((
    message: string,
    options?: MessageOptions
  ) => {
    messageService.info(message, options);
  }, []);

  const showWarning = useCallback((
    message: string,
    options?: MessageOptions
  ) => {
    messageService.warning(message, options);
  }, []);

  const showRetryableError = useCallback((
    message: string,
    onRetry: () => void
  ) => {
    messageService.retryableError(message, onRetry);
  }, []);

  const showSystemError = useCallback((
    message?: string
  ) => {
    messageService.systemError(message);
  }, []);

  const showProgress = useCallback((
    initialMessage: string,
    type: MessageType = 'info'
  ) => {
    return messageService.progress(initialMessage, type);
  }, []);

  return {
    showMessage,
    showSuccess,
    showError,
    showInfo,
    showWarning,
    showRetryableError,
    showSystemError,
    showProgress
  };
}
