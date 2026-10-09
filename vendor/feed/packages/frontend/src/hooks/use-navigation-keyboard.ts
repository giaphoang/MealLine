// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useCallback, useEffect, useRef } from 'react';

interface UseNavigationKeyboardProps {
  itemCount: number;
  onNavigate: (index: number) => void;
  isCollapsed?: boolean;
}

export function useNavigationKeyboard({
  itemCount,
  onNavigate,
  isCollapsed = false,
}: UseNavigationKeyboardProps) {
  const currentIndex = useRef<number>(0);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // This is a document-level listener, so it must NOT swallow arrow /
      // Home / End keys while the user is editing text — otherwise the cursor
      // can't be moved with the keyboard in any field. Bail out when focus is
      // in an editable element (input, textarea, select, or contentEditable).
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      let newIndex = currentIndex.current;

      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          event.preventDefault();
          newIndex = (currentIndex.current + 1) % itemCount;
          break;
        case 'ArrowUp':
        case 'ArrowLeft':
          event.preventDefault();
          newIndex = (currentIndex.current - 1 + itemCount) % itemCount;
          break;
        case 'Home':
          event.preventDefault();
          newIndex = 0;
          break;
        case 'End':
          event.preventDefault();
          newIndex = itemCount - 1;
          break;
        default:
          return;
      }

      currentIndex.current = newIndex;
      onNavigate(newIndex);
    },
    [itemCount, onNavigate]
  );

  useEffect(() => {
    if (!isCollapsed) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [handleKeyDown, isCollapsed]);

  return {
    currentIndex: currentIndex.current,
  };
}