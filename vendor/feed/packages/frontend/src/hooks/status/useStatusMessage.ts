// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useState, useEffect } from 'react';
// `@/types/status` has never existed. StatusMessage lives in the food-item
// types, which is where this hook's only consumer (useFoodForm) comes from.
import type { StatusMessage } from '@/types/food-item';

interface MessageConfig {
  duration: number;
  fadeDelay: number;
}

interface MessageTypeConfig {
  success: MessageConfig;
  error: MessageConfig;
  info: MessageConfig;
}

interface UseStatusMessageOptions {
  config?: Partial<MessageTypeConfig>;
  hideOnSuccess?: boolean;
}

const DEFAULT_CONFIG: MessageTypeConfig = {
  success: {
    duration: 4000,
    fadeDelay: 3500
  },
  error: {
    duration: 6000,
    fadeDelay: 5500
  },
  info: {
    duration: 5000,
    fadeDelay: 4500
  }
};

const defaultOptions: UseStatusMessageOptions = {
  config: DEFAULT_CONFIG,
  hideOnSuccess: true
};

export function useStatusMessage(options: UseStatusMessageOptions = defaultOptions) {
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (status) {
      setIsVisible(true);
      
      // Only auto-hide for success messages or if not an error
      const config = options.config ?? DEFAULT_CONFIG;
      const messageConfig = config[status.type];
      
      if ((options.hideOnSuccess && status.type === 'success') || status.type !== 'error') {
        const timer = setTimeout(() => {
          setIsVisible(false);
          // Clean up status after fade animation
          setTimeout(() => setStatus(null), 300);
        }, messageConfig.duration);

        // Start fade out animation
        const fadeTimer = setTimeout(() => {
          setIsVisible(false);
        }, messageConfig.fadeDelay);
        
        return () => {
          clearTimeout(timer);
        };
      }
    }
  }, [status, options.autoHideDuration, options.hideOnSuccess]);

  const showMessage = (message: string, type: StatusMessage['type'] = 'info') => {
    setStatus({ type, message });
  };

  const clearMessage = () => {
    setIsVisible(false);
    setTimeout(() => setStatus(null), 300);
  };

  return {
    status,
    isVisible,
    showMessage,
    clearMessage
  };
}