// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const humanizeString = (str: string) => {
  return str
    .replace(/([A-Z])/g, ' $1') // Insert a space before all caps
    .replace(/^./, function(str){ return str.toUpperCase(); }) // Capitalize the first letter
    .trim() // Trim any extra spaces
}

export const normalizeLanguage = (language: string | null | undefined): string => {
  if (!language) return '';
  return language.toLowerCase().trim();
};

interface CookieOptions {
  maxAge?: number;
  path?: string;
  domain?: string;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

export function getCookie(name: string): string | null {
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [cookieName, cookieValue] = cookie.split('=').map(c => c.trim());
    if (cookieName === name) {
      return decodeURIComponent(cookieValue);
    }
  }
  return null;
}

export function setCookie(name: string, value: string, options: CookieOptions = {}) {
  let cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;

  if (options.maxAge) {
    cookie += `; max-age=${options.maxAge}`;
  }
  if (options.path) {
    cookie += `; path=${options.path}`;
  }
  if (options.domain) {
    cookie += `; domain=${options.domain}`;
  }
  if (options.secure) {
    cookie += '; secure';
  }
  if (options.sameSite) {
    cookie += `; samesite=${options.sameSite}`;
  }

  document.cookie = cookie;
}

// Constants for filename truncation in modals
export const MODAL_TEXT_AREA_WIDTH = 280; // pixels from max-w-[280px]
export const CHAR_TO_PIXEL_RATIO = 8; // conservative estimate: 8px per character
export const MAX_FILENAME_CHARS = Math.floor(MODAL_TEXT_AREA_WIDTH / CHAR_TO_PIXEL_RATIO); // 35 chars

/**
 * Truncates a filename in the middle with ellipsis, preserving file extension
 * Uses mathematical formula: ellipsis placement = (maxChars - 3) / 2
 * @param filename The filename to truncate
 * @param maxChars Maximum character count (defaults to calculated modal width)
 * @returns Truncated filename with middle ellipsis or original if short enough
 */
export function truncateMiddle(filename: string, maxChars: number = MAX_FILENAME_CHARS): string {
  if (!filename || filename.length <= maxChars) {
    return filename;
  }

  // Separate filename and extension
  const lastDotIndex = filename.lastIndexOf('.');
  const hasExtension = lastDotIndex > 0 && lastDotIndex < filename.length - 1;
  
  if (hasExtension) {
    const name = filename.substring(0, lastDotIndex);
    const extension = filename.substring(lastDotIndex);
    
    // Calculate available space for name (accounting for extension and ellipsis)
    const availableForName = maxChars - extension.length - 3; // 3 for "..."
    
    if (availableForName <= 0) {
      // If extension is too long, just truncate the whole filename
      const splitPoint = Math.floor((maxChars - 3) / 2);
      return filename.substring(0, splitPoint) + '...' + filename.substring(filename.length - splitPoint);
    }
    
    if (name.length <= availableForName) {
      return filename; // No truncation needed
    }
    
    // Truncate the name part in the middle
    const splitPoint = Math.floor(availableForName / 2);
    return name.substring(0, splitPoint) + '...' + name.substring(name.length - (availableForName - splitPoint)) + extension;
  } else {
    // No extension, truncate in the middle
    const splitPoint = Math.floor((maxChars - 3) / 2);
    return filename.substring(0, splitPoint) + '...' + filename.substring(filename.length - splitPoint);
  }
}

/**
 * Generate a pagination range with ellipsis for large numbers
 * @param current Current page number (1-based)
 * @param total Total number of pages
 * @param displayCount Number of page buttons to display
 * @returns Array of page numbers and ellipsis strings
 */
export function rangePagination(
  current: number,
  total: number,
  displayCount: number = 5
): (number | string)[] {
  // Handle edge cases
  if (total <= 1) return [1];
  if (total <= displayCount) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const leftSiblingIndex = Math.max(current - 1, 1);
  const rightSiblingIndex = Math.min(current + 1, total);

  const shouldShowLeftDots = leftSiblingIndex > 2;
  const shouldShowRightDots = rightSiblingIndex < total - 1;

  // Case 1: Show dots on the right side only
  if (!shouldShowLeftDots && shouldShowRightDots) {
    const leftItemCount = 3;
    const leftRange = Array.from(
      { length: leftItemCount },
      (_, i) => i + 1
    );
    return [...leftRange, "...", total];
  }

  // Case 2: Show dots on the left side only
  if (shouldShowLeftDots && !shouldShowRightDots) {
    const rightItemCount = 3;
    const rightRange = Array.from(
      { length: rightItemCount },
      (_, i) => total - rightItemCount + i + 1
    );
    return [1, "...", ...rightRange];
  }

  // Case 3: Show dots on both sides
  if (shouldShowLeftDots && shouldShowRightDots) {
    const middleRange = [leftSiblingIndex, current, rightSiblingIndex];
    return [1, "...", ...middleRange, "...", total];
  }

  // Default fallback (shouldn't reach here)
  return Array.from({ length: total }, (_, i) => i + 1);
}