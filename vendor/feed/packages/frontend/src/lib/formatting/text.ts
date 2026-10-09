// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Utility functions for text input formatting
 */

export interface TextFormattingOptions {
  maxLength?: number;
  allowFirstCharacterNumber?: boolean;
}

const defaultOptions: TextFormattingOptions = {
  maxLength: 36,
  allowFirstCharacterNumber: true
};

/**
 * Formats input text according to standard rules
 * - Removes leading/trailing spaces
 * - Enforces first character constraints
 * - Capitalizes words after spaces and special characters
 * - Collapses multiple spaces
 */
export const formatText = (text: string, options: TextFormattingOptions = defaultOptions): string => {
  // Remove leading spaces
  let formatted = text.replace(/^\s+/, '');

  // Validate first character
  const firstCharPattern = options.allowFirstCharacterNumber ? /^[a-zA-Z0-9]/ : /^[a-zA-Z]/;
  if (formatted.length > 0 && !firstCharPattern.test(formatted)) {
    formatted = '';
  }

  // Capitalize first character if it's a letter
  if (formatted.length > 0 && /^[a-zA-Z]/.test(formatted)) {
    formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }

  // Capitalize letters after spaces and special characters
  formatted = formatted.replace(/[- (\[&'"][a-zA-Z]/g, match => match.toUpperCase());

  // Replace multiple spaces with single space
  formatted = formatted.replace(/\s+/g, ' ');

  // Apply max length if specified
  if (options.maxLength) {
    formatted = formatted.substring(0, options.maxLength);
  }

  return formatted;
};

/**
 * Resolves the name an edit form should submit. An untouched name is
 * returned verbatim: stored names that predate the current Title-Case
 * rules would otherwise be silently reformatted, which reads as a rename
 * and falsely triggers translation management on unrelated edits (e.g. a
 * limit-only change). An edited name gets the standard submit-time
 * formatting (ISSUES.md #38).
 */
export const resolveSubmittedName = (name: string, initialName: string): string => {
  return name === initialName ? initialName : formatText(name).trim();
};

/**
 * Validates if text meets minimum length requirement
 */
export const validateMinLength = (text: string, minLength: number = 3): boolean => {
  return text.trim().length >= minLength;
};

/**
 * Creates a change handler for text inputs.
 *
 * Title-Case / formatting is intentionally NOT applied here. Reformatting a
 * controlled input on every keystroke resets the caret to the end, so editing
 * mid-string is impossible (you arrow back, type, and the cursor jumps to the
 * end). Instead, the raw value is stored as typed and `formatText` is applied
 * once at submit time by each form (ISSUES.md #38). Native `maxLength` on the
 * input still caps length caret-safely during typing.
 *
 * The `options` parameter is retained for backward compatibility but unused;
 * length is enforced by the input's `maxLength` and by `formatText` at submit.
 */
export const createFormattedChangeHandler = (
  setValue: (value: string) => void,
  _options?: TextFormattingOptions
) => {
  return (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  };
};

/**
 * Windows reserved filenames that should be avoided
 */
const RESERVED_FILENAMES = [
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
];

/**
 * Formats filename text according to safe filesystem rules
 * - Removes unsafe characters
 * - Removes leading/trailing spaces and dots
 * - Collapses multiple spaces
 * - Enforces 64 character limit
 * - Preserves international characters
 */
export const formatFilename = (text: string): string => {
  // Remove unsafe filesystem characters
  let formatted = text.replace(/[<>:"|?*\\/\x00-\x1f]/g, '');
  
  // Remove control characters and other unsafe chars
  formatted = formatted.replace(/[\x7f~#%&{}@]/g, '');
  
  // Replace multiple spaces with single space
  formatted = formatted.replace(/\s+/g, ' ');
  
  // Remove leading/trailing spaces and dots
  formatted = formatted.replace(/^[\s.]+|[\s.]+$/g, '');
  
  // Apply 64 character limit
  formatted = formatted.substring(0, 64);
  
  return formatted;
};

/**
 * Auto-sanitizes uploaded filename by cleaning invalid characters
 * Used when processing files uploaded by users
 */
export const sanitizeUploadedFilename = (originalName: string): { sanitized: string; wasChanged: boolean } => {
  // Remove .docx extension if present for processing
  const nameWithoutExt = originalName.replace(/\.docx$/i, '');
  const sanitized = formatFilename(nameWithoutExt);
  
  // If sanitization results in empty string, create a fallback
  const finalName = sanitized.length === 0 
    ? `Document_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '_')}`
    : sanitized;
    
  const wasChanged = nameWithoutExt !== finalName;
  
  return { sanitized: finalName, wasChanged };
};

/**
 * Validates filename according to filesystem safety rules
 */
export const validateFilename = (filename: string): { isValid: boolean; error?: string } => {
  const trimmed = filename.trim();
  
  // Check minimum length
  if (trimmed.length === 0) {
    return { isValid: false, error: 'Filename cannot be empty' };
  }
  
  // Check maximum length
  if (trimmed.length > 64) {
    return { isValid: false, error: 'Filename too long (maximum 64 characters)' };
  }
  
  // Check for unsafe characters
  if (/[<>:"|?*\\/\x00-\x1f\x7f~#%&{}@]/.test(trimmed)) {
    return { isValid: false, error: 'Filename contains invalid characters' };
  }
  
  // Check for leading/trailing spaces or dots
  if (/^[\s.]|[\s.]$/.test(trimmed)) {
    return { isValid: false, error: 'Filename cannot start or end with spaces or dots' };
  }
  
  // Check for reserved names (case insensitive)
  const upperName = trimmed.toUpperCase();
  if (RESERVED_FILENAMES.includes(upperName)) {
    return { isValid: false, error: 'This is a reserved filename' };
  }
  
  return { isValid: true };
};

/**
 * Creates a change handler for filename inputs with formatting
 */
export const createFilenameChangeHandler = (
  setValue: (value: string) => void
) => {
  return (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatFilename(e.target.value);
    setValue(formatted);
  };
};