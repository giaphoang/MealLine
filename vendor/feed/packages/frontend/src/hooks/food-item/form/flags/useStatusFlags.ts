// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useState, useCallback } from 'react';
import { 
  StatusFlags, 
  StatusInfo,
  StatusDisplay,
  DEFAULT_STATUS_FLAGS, 
  STATUS_DISPLAY_CONFIG
} from '@/types/food-item';
import { Box, Package, AlertCircle, AlertTriangle, Tag, X } from "@/components/ui/icons";

const ICONS = {
  box: Box,
  package: Package,
  'alert-circle': AlertCircle,
  'alert-triangle': AlertTriangle,
  tag: Tag,
  x: X
} as const;

export interface UseStatusFlagsReturn {
  flags: StatusFlags;
  handleFlagChange: (key: keyof StatusFlags) => void;
  getStatusInfo: () => StatusInfo;
  setFlags: (flags: StatusFlags) => void;
  reset: () => void;
  validateFlags: () => boolean;
  error: string | null;
}

/**
 * Hook for managing food item status flags
 * - Flags can be combined (e.g., Limited + Clearance)
 * - Item is out of stock when isInStock is false
 * - Status display adapts to show all active states
 */
export const useStatusFlags = (
  initialFlags: StatusFlags = DEFAULT_STATUS_FLAGS
): UseStatusFlagsReturn => {
  const [flags, setFlags] = useState<StatusFlags>(initialFlags);
  const [error, setError] = useState<string | null>(null);

  const handleFlagChange = useCallback((key: keyof StatusFlags) => {
    setFlags(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
    setError(null);
  }, []);

  const getStatusInfo = useCallback((): StatusInfo => {
    const displays: StatusDisplay[] = [];
    const { isInStock, isLimited, isClearance } = flags;

    // Item is considered unavailable when not in stock
    if (!isInStock) {
      displays.push({
        ...STATUS_DISPLAY_CONFIG.OUT_OF_STOCK,
        icon: ICONS[STATUS_DISPLAY_CONFIG.OUT_OF_STOCK.icon as keyof typeof ICONS]
      });
    } else {
      // Show In Stock badge first
      displays.push({
        ...STATUS_DISPLAY_CONFIG.IN_STOCK,
        icon: ICONS[STATUS_DISPLAY_CONFIG.IN_STOCK.icon as keyof typeof ICONS]
      });

      // Add Limited Supply if flagged
      if (isLimited) {
        displays.push({
          ...STATUS_DISPLAY_CONFIG.LIMITED,
          icon: ICONS[STATUS_DISPLAY_CONFIG.LIMITED.icon as keyof typeof ICONS]
        });
      }

      // Add Clearance if flagged
      if (isClearance) {
        displays.push({
          ...STATUS_DISPLAY_CONFIG.CLEARANCE,
          icon: ICONS[STATUS_DISPLAY_CONFIG.CLEARANCE.icon as keyof typeof ICONS]
        });
      }
    }

    return {
      flags,
      displays,
      isAvailable: isInStock
    };
  }, [flags]);

  const validateFlags = useCallback((): boolean => {
    // All flag combinations are valid in new system
    // Reset any previous errors
    setError(null);
    
    // No validation needed - all combinations are allowed
    return true;
  }, []);

  const reset = useCallback(() => {
    setFlags(DEFAULT_STATUS_FLAGS);
    setError(null);
  }, []);

  return {
    flags,
    error,
    validateFlags,
    handleFlagChange,
    getStatusInfo,
    setFlags,
    reset
  };
};