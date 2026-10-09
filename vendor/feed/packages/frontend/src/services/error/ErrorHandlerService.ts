// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { messageService } from '@/services/message';
import { SUPPORT_CONTACT_SENTENCE } from '@/lib/support';

/**
 * Maps known error messages to more user-friendly, actionable messages.
 */
const errorMessageMap: { [key: string]: string } = {
  'Failed to fetch': 'Network error: Please check your internet connection and try again.',
  'Network Error': 'Network error: Please check your internet connection and try again.',
  'A food item with this name already exists': 'A food item with this name already exists. Please choose a different name.',
  'A category with this name already exists': 'A category with this name already exists. Please choose a different name.',
  'Language name must be between 2 and 50 characters': 'Language name must be between 2 and 50 characters. Please check your input.',
  'No languages provided for update': 'No languages were selected for update. Please select at least one language.',
  'Duplicate language name found': 'Duplicate language detected in your selection. Please check your language list.',
  'Invalid enabled state for language': 'Invalid language status detected. Please refresh and try again.',
  'Failed to fetch languages': 'Unable to load language list. Please check your connection and try again.',
  'Failed to fetch enabled languages': 'Unable to load enabled languages. Please check your connection and try again.',
  'Failed to count translations': 'Unable to check translation count. Please try again.',
  'Failed to update languages': 'Unable to save language changes. Please check your selections and try again.',
  'Failed to fetch translations': 'Unable to load translation list. Please check your connection and try again.',
  'Failed to load translations': 'Unable to load translation list. Please check your connection and try again.',
  'Failed to create translation': 'Unable to start translation process. Please check your text and try again.',
  'Failed to update translation': 'Unable to save translation changes. Please check your input and try again.',
  'Failed to delete translation': 'Unable to delete translation. Please try again or refresh the page.',
  'Failed to bulk delete translations': 'Unable to delete selected translations. Some items may have been processed.',
  'Failed to bulk retry translations': 'Unable to retry selected translations. Some items may have been processed.',
  'Failed to include original text in translations': 'Unable to add original text to translations. Please try again.',
  'Failed to remove original text from translations': 'Unable to remove original text from translations. Please try again.',
  'Failed to find missing translations': 'Unable to scan for missing translations. Please check your connection and try again.',
  'Failed to skip translation': 'Unable to skip translation. Please try again.',
  'Failed to skip translations': 'Unable to skip selected translations. Some items may have been processed.',
  'Failed to enable translation': 'Unable to enable translation. Please try again.',
  'Failed to enable translations': 'Unable to enable selected translations. Some items may have been processed.',
  'No target languages are enabled': 'No target languages are available. Please enable languages in the Language Management section.',
  'No target languages found': 'No valid target languages detected. Please enable at least one non-English language.',
  'translation not found': 'The requested translation could not be found. It may have been deleted.',
  'text too long for translation': 'Text is too long for translation. Please use shorter text or split into multiple translations.',
  'invalid language code': 'Invalid language selected. Please choose a valid language from the list.',
  'translation already exists': 'A translation already exists for this text and language combination.',
  'document not found': 'The requested document could not be found. It may have been deleted.',
  'file not found': 'The requested file could not be found. It may have been moved or deleted.',
  'unauthorized': 'You are not authorized to perform this action. Please log in again.',
  'forbidden': 'You do not have permission to access this resource.',
  'internal server error': 'An unexpected error occurred on our end. Please try again later.',
  'service unavailable': 'The service is temporarily unavailable. Please try again in a few minutes.',
  // AI Configuration errors
  'Configuration name must be between 3 and 100 characters': 'Configuration name must be between 3 and 100 characters. Please check your input.',
  'Configuration name must be a string': 'Configuration name is required. Please enter a valid name.',
  'Prompt value must be a string': 'Prompt content is required. Please enter valid prompt text.',
  'Prompt value cannot be empty': 'Prompt content cannot be empty. Please enter your prompt text.',
  'Prompt value must be 4000 characters or less': 'Prompt is too long. Please keep it under 4000 characters.',
  'System prompt name must be between': 'System prompt name must be between 3 and 100 characters. Please check your input.',
  'System prompt name must be a string': 'System prompt name is required. Please enter a valid name.',
  'Invalid prompt type': 'Invalid prompt type selected. Please choose a valid option.',
  'must be a number': 'Invalid number entered. Please enter a valid numeric value.',
  'temperature must be between': 'Temperature must be between 0 and 2.0. Please adjust your value.',
  'topP must be between': 'Top P must be between 0 and 1.0. Please adjust your value.',
  'Threshold must be between': 'Threshold must be between 0 and 1.0. Please adjust your value.',
  'No configurations selected for deletion': 'No configurations were selected. Please select at least one configuration to delete.',
  'No system prompts selected for deletion': 'No prompts were selected. Please select at least one prompt to delete.',
  'No configurations selected for toggle': 'No configurations were selected. Please select at least one configuration to activate/deactivate.',
  'No system prompts selected for toggle': 'No prompts were selected. Please select at least one prompt to activate/deactivate.',
  'ENCRYPTION_MASTER_KEY environment variable is required': 'System setup required. Please complete the initial setup process.',
  'SYSTEM_UNINITIALIZED': 'System setup required. Please complete the initial setup process.',
  'Failed to load configurations': 'Unable to load AI configurations. Please check your connection and try again.',
  'Failed to create configuration': 'Unable to create configuration. Please check your input and try again.',
  'Failed to update configuration': 'Unable to save configuration changes. Please check your input and try again.',
  'Failed to delete configuration': 'Unable to delete configuration. Please try again or refresh the page.',
  'Failed to toggle configuration': 'Unable to change configuration status. Please try again.',
  // Shopping List Builder errors
  'Builder template data is required': 'The builder could not read the current canvas. Refresh the page and try Preview PDF again.',
  'Builder PDF preview currently supports Letter paper only': 'PDF preview currently supports Letter paper. Select the Letter canvas and try again.',
  'Template must include at least one printable component': 'Add at least one printable component to the canvas, then try Preview PDF again.',
  'Each builder component must include an ID and component type': 'One canvas component is missing required builder data. Remove the selected component or reset the mockup, then try again.',
  'Unsupported builder component type': 'One canvas component is not supported by the PDF preview. Remove it or reset the mockup, then try again.',
  'Unable to create builder PDF preview': 'The builder could not create the PDF preview. Check the canvas for invalid components, then try again.',
  'Saved component data is required': 'The selected component could not be saved because its builder data is missing. Select another component or reset the canvas, then try again.',
  'Saved component name is required': 'The selected component needs a name before saving. Add a component name, then save again.',
  'Saved component name must be between 3 and 80 characters': 'Component names must be between 3 and 80 characters. Shorten or rename the selected component, then save again.',
  'Invalid saved component ID': 'The saved component could not be loaded because its identifier is invalid. Refresh Saved Components and try again.',
  'Saved component not found': 'The saved component could not be found. Refresh Saved Components and choose another component.',
  'Please log in to save and load shopping list builder content': 'Please log in before saving or loading builder content. After logging in, return to the builder and try again.',
  'Invalid saved template ID': 'The saved page template could not be loaded because its identifier is invalid. Refresh Saved Templates and try again.',
  'Saved template name is required': 'The page template needs a name before saving. Enter a template name, then save again.',
  'Saved template name must be between 3 and 48 characters': 'Page template names must be between 3 and 48 characters. Shorten this template name, then save again.',
  'Saved template not found': 'The saved page template could not be found. Refresh Saved Templates and choose another template.',
  'Invalid food item ID': 'That inventory item could not be updated because its identifier is invalid. Refresh Inventory Sections, then try again.',
  'Limit must be a whole number between 1 and 100': 'Limits must be whole numbers from 1 to 100. Enter a valid limit, or leave it blank to use the category default.',
  'Food item not found': 'That inventory item could not be found. Refresh Inventory Sections, then try again.',
  'Failed to load system prompts': 'Unable to load system prompts. Please check your connection and try again.',
  'Failed to create system prompt': 'Unable to create system prompt. Please check your input and try again.',
  'Failed to update system prompt': 'Unable to save prompt changes. Please check your input and try again.',
  'Failed to delete system prompt': 'Unable to delete system prompt. Please try again or refresh the page.',
  'Failed to toggle system prompt': 'Unable to change prompt status. Please try again.',
  'Failed to load cache stats': 'Unable to load cache statistics. Please try again.',
  'Failed to clear cache': 'Unable to clear cache. Please try again.',
  'A configuration with this name already exists': 'A configuration with this name already exists. Please choose a different name.',
  'A system prompt with this name already exists': 'A system prompt with this name already exists. Please choose a different name.',
  // AI Translation Provider errors
  'OpenAI API configuration required': 'OpenAI API not configured. Please set up your API key in Tools → AI Configuration.',
  'Anthropic API configuration required': 'Anthropic API not configured. Please set up your API key in Tools → AI Configuration.',
  'Google AI API configuration required': 'Google AI API not configured. Please set up your API key in Tools → AI Configuration.',
  'Translation service not configured - authentication failed': 'AI service authentication failed. Please check your API key in Tools → AI Configuration.',
  'Classification service not configured - authentication failed': 'AI service authentication failed. Please check your API key in Tools → AI Configuration.',
  'Rate limit exceeded - please try again later': 'API rate limit reached. Please wait a moment and try again.',
  'Translation limit exceeded': 'Translation quota exceeded. Please check your usage limits or try again later.',
  'OpenAI service error - please try again later': 'OpenAI service is temporarily unavailable. Please try again in a few minutes.',
  'Anthropic service error - please try again later': 'Anthropic service is temporarily unavailable. Please try again in a few minutes.',
  'Google AI service error - please try again later': 'Google AI service is temporarily unavailable. Please try again in a few minutes.',
  'Unsupported language': 'This language is not supported by the selected AI service. Please choose a different language.',
  'Translation response was truncated due to length': 'Text is too long for translation. Please try with shorter text or split into sections.',
  'Translation was halted by content filter': 'Translation blocked by content filter. Please check your text and try again.',
  'Classification was halted by content filter': 'Classification blocked by content filter. Please check your text and try again.',
  'Invalid response format from translation service': 'Translation service returned invalid data. Please try again.',
  'Invalid response format from classification service': 'Classification service returned invalid data. Please try again.',
  'Failed to translate text - unexpected error': 'Translation failed due to an unexpected error. Please try again.',
  'Failed to translate batch - unexpected error': 'Batch translation failed due to an unexpected error. Please try again.',
  'Failed to classify segments - unexpected error': 'Text classification failed due to an unexpected error. Please try again.',
  'AI model not configured': 'AI model not selected. Please choose a model in Tools → AI Configuration.',
  'OpenAI client not initialized': 'OpenAI connection failed. Please check your configuration and try again.',
  'Anthropic client not initialized': 'Anthropic connection failed. Please check your configuration and try again.',
  'Google client not initialized': 'Google AI connection failed. Please check your configuration and try again.',
  // Document Management errors - Upload Operations
  'already exists. Please choose a different name.': 'A document with this name already exists. Please choose a different name.',
  'A document named': 'A document with this name already exists. Please choose a different name.',
  'Please select a file to upload': 'Please select a file to upload. No file was provided.',
  'Please upload a DOCX file': 'Please upload a DOCX file. Other file formats are not supported at this time.',
  'Only DOCX files are supported': 'Please upload a DOCX file. Other file formats are not supported at this time.',
  'Please upload a smaller file': 'Please upload a smaller file. The maximum size allowed is 5MB.',
  'File size exceeds': 'Please upload a smaller file. The file exceeds the maximum size limit.',
  'maximum size allowed is 5MB': 'Please upload a smaller file. The maximum size allowed is 5MB.',
  'Unable to save your file': `Unable to save your file. Please try again. ${SUPPORT_CONTACT_SENTENCE}`,
  'Unable to process your document': `Unable to process your document. Please try again later. ${SUPPORT_CONTACT_SENTENCE}`,
  'There was a problem uploading your document': `There was a problem uploading your document. Please try again. ${SUPPORT_CONTACT_SENTENCE}`,
  // Document Management errors - Document Operations
  'Document with ID': 'The requested document could not be found. It may have been deleted or moved.',
  'not found': 'The requested item could not be found. It may have been deleted or moved.',
  'Document not found': 'The requested document could not be found. It may have been deleted or moved.',
  'has no content': 'This document has no content available. The file may be missing or corrupted.',
  'Document has no content': 'This document has no content available. The file may be missing or corrupted.',
  'Document name is required': 'Document name is required. Please enter a valid name.',
  'Invalid document ID': 'Invalid document identifier provided. Please try again or refresh the page.',
  'Invalid or empty document IDs array': 'No documents were selected. Please select at least one document.',
  // Document Management errors - Translation Operations  
  'Translation for document ID': 'The requested translation could not be found. It may have been deleted.',
  'Translation not found': 'The requested translation could not be found. It may have been deleted.',
  'No text found in document to translate': 'No translatable text found in document. The document may be empty or contain only non-text elements.',
  'Languages array is required': 'Please select at least one language for translation.',
  'No file provided': 'Please select a file to upload.',
  'Please use full language name instead of code': 'Please use the full language name instead of a language code.',
  'Please use full language names instead of codes': 'Please use full language names instead of language codes.',
  // Document Management errors - Storage and File System
  'Error saving file': `Unable to save the file to storage. Please try again. ${SUPPORT_CONTACT_SENTENCE}`,
  'Error getting file': 'Unable to retrieve the file from storage. The file may be missing or corrupted.',
  'storage': `Storage system error occurred. Please try again. ${SUPPORT_CONTACT_SENTENCE}`,
  'file system': `File system error occurred. Please try again. ${SUPPORT_CONTACT_SENTENCE}`,
  'Failed to delete document file': `Unable to delete the document file. Please try again. ${SUPPORT_CONTACT_SENTENCE}`,
  'Failed to delete translation file': `Unable to delete the translation file. Please try again. ${SUPPORT_CONTACT_SENTENCE}`,
  // Document Management errors - Download Operations
  'Document file not found': 'The document file could not be found. It may have been moved or deleted from storage.',
  'Translation file not found': 'The translation file could not be found. It may have been moved or deleted from storage.',
  'Error downloading': 'Unable to download the file. Please try again or check if the file still exists.',
  'Failed to download': 'Unable to download the file. Please try again or check if the file still exists.',
  // Document Management errors - Integrity and Validation
  'integrity': 'File integrity issue detected. The file may be missing or corrupted.',
  'integrityIssue': 'File integrity issue detected. The file may be missing or corrupted.',
  'File for document': 'Document file integrity issue. The file may be missing or corrupted.',
  'missing or corrupt': 'The file may be missing or corrupt. Please try re-uploading the document.',
  'corrupted': 'The file appears to be corrupted. Please try re-uploading the document.',
};

/**
 * Provides a centralized way to handle and display API errors.
 * Includes mappings for:
 * - Network and connectivity errors
 * - Food item and category validation errors  
 * - Language management errors
 * - Translation management and processing errors
 * - Document and file operation errors (comprehensive coverage)
 *   - Upload operations (file validation, size limits, duplicates)
 *   - Document operations (CRUD, content validation)
 *   - Translation operations (language validation, processing)
 *   - Storage and file system errors
 *   - Download operations (file retrieval, integrity)
 *   - Integrity and validation errors
 * - AI Configuration and system prompt errors
 * - AI Translation Provider errors (OpenAI, Anthropic, Google AI)
 * - Authentication and authorization errors
 * - Server and service errors
 */
export class ErrorHandlerService {
  /**
   * Handles an error by displaying a standardized toast message.
   * The centralized message service collapses identical messages raised by
   * different page-load requests within its duplicate window.
   * @param error - The error object to handle.
   * @param context - An optional string providing context for the error.
   */
  public static handleError(error: unknown, context?: string): void {
    console.error(`[${context || 'Global'}] API Error:`, error);
    messageService.error(this.toUserMessage(error));
  }

  /**
   * The ASK-compliant sentence for an error, without showing it.
   *
   * `handleError` raises a toast, but not every surface is a toast: the
   * Translate & Download PDFs modal reports each language's outcome on its
   * own row, and it read `error.message` directly. That bypassed every
   * screen below and printed a whole Cloudflare 502 HTML page into the
   * dialog (ISSUES.md #80). Anything rendering an error inline should come
   * through here so one set of rules decides what a user is shown.
   */
  public static toUserMessage(error: unknown): string {
    let rawMessage = 'An unknown error occurred.';
    const errorLike = error as {
      code?: unknown;
      message?: unknown;
      response?: { data?: { message?: unknown } };
    } | null;

    // Check for a detailed API error response
    if (typeof errorLike?.response?.data?.message === 'string') {
      rawMessage = errorLike.response.data.message;
    } else if (typeof errorLike?.message === 'string') {
      rawMessage = errorLike.message;
    }

    // A message the server labelled with an application error code is curated
    // prose from one of our own routes — a leaked driver dump or stack trace
    // never carries one. That distinction is what lets a long, deliberate
    // explanation through while still blocking developer artifacts.
    const hasServerCode =
      typeof errorLike?.code === 'string' && errorLike.code.length > 0;

    const GENERIC_FALLBACK = 'An unexpected error occurred. Please try again.';
    let userMessage = GENERIC_FALLBACK;

    // Find a more user-friendly message from the map
    let matched = false;
    for (const key in errorMessageMap) {
      if (rawMessage.toLowerCase().includes(key.toLowerCase())) {
        userMessage = errorMessageMap[key];
        matched = true;
        break;
      }
    }

    // No override matched. Backend routes already produce ASK-compliant,
    // user-facing messages (specific + actionable), so surface the raw
    // message rather than masking it with a generic fallback -- a generic
    // "something went wrong" leaves the user helpless. We only fall back to
    // the generic text when the raw message is missing, is our own unknown
    // placeholder, or looks like a developer-facing payload (JSON / stack
    // trace / HTML) that would confuse rather than help.
    if (!matched && this.isUserPresentableMessage(rawMessage, hasServerCode)) {
      userMessage = rawMessage;
    }

    return userMessage;
  }

  /**
   * Heuristic: is this raw error message safe to show a non-technical user?
   * Backend route errors are curated prose; raw provider errors, JSON
   * payloads, stack traces and HTML pages are not. We surface the former and
   * fall back to a generic message for the latter.
   */
  private static isUserPresentableMessage(
    message: string,
    hasServerCode = false
  ): boolean {
    if (!message) return false;
    const trimmed = message.trim();
    if (trimmed.length === 0) return false;
    // Our own "we don't know" placeholder -- not informative.
    if (trimmed === 'An unknown error occurred.') return false;
    // Developer-facing payloads: JSON, HTML, stack traces, status text.
    if (/^[[{<]/.test(trimmed)) return false;
    if (/<!DOCTYPE|<html|Cannot (GET|POST|PUT|DELETE)/i.test(trimmed)) return false;
    if (/\bat\s+\w+.*\(.*:\d+:\d+\)/.test(trimmed)) return false;
    if (/\bApiError\b|\bTypeError\b|\bReferenceError\b/.test(trimmed)) return false;
    // Bare HTTP status lines like "Request failed with status code 500".
    if (/^Request failed with status code \d+$/i.test(trimmed)) return false;
    // Should read like a sentence, not a token/identifier.
    if (!/\s/.test(trimmed)) return false;

    // Defense in depth. The backend withholds internal failure messages, but a
    // leak from any other source must not reach a toast either. These are the
    // shapes a terminal dump takes:
    // multi-line blobs, ORM invocation traces, filesystem paths, SQL, and
    // anything far longer than a sentence a person would want to read.
    if (/\r|\n/.test(trimmed)) return false;
    // Length is a proxy for "this looks like a dump", and it is the wrong test
    // for a message the server deliberately labelled. The two-administrator
    // refusal is 251 characters of necessary explanation — it names the rule,
    // says why the rule exists, and gives two ways forward — and this cap
    // silently replaced all of it with "An unexpected error occurred"
    // (ISSUES.md #60). Coded errors are exempt; everything else still capped.
    if (!hasServerCode && trimmed.length > 240) return false;
    if (/\bprisma\.\w+\.\w+\(\)|\bInvalid `/i.test(trimmed)) return false;
    if (/Unknown argument|Argument `\w+`|available options are marked/i.test(trimmed)) return false;
    if (/(^|\s)(\/[\w.-]+){2,}\/?/.test(trimmed)) return false;
    if (/[A-Za-z]:\\[\w\\.-]+/.test(trimmed)) return false;
    if (/\b(SELECT|INSERT INTO|UPDATE \w+ SET|DELETE FROM)\b/.test(trimmed)) return false;
    if (/\b(ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EADDRINUSE|SQLITE_\w+)\b/.test(trimmed)) return false;
    if (/node_modules|\.ts:\d+|\.js:\d+/.test(trimmed)) return false;

    return true;
  }

  /**
   * A wrapper for making API calls that automatically handles errors.
   * @param apiCall - The function that returns a promise from the API call.
   * @param context - An optional string providing context for the error.
   * @returns The result of the API call.
   * @throws The original error after handling it.
   */
  public static async withErrorHandling<T>(
    apiCall: () => Promise<T>,
    context?: string
  ): Promise<T> {
    try {
      return await apiCall();
    } catch (error) {
      this.handleError(error, context);
      throw error; // Re-throw the error so the calling function knows it failed
    }
  }
}
