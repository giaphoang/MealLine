// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

// Backward compatibility wrapper for new AI service architecture
import { AIServiceFactory } from './ai/factory/AIServiceFactory';
import { TranslationRequest, TranslationResult, ClassificationRequest, ClassificationResult, BatchTranslationRequest, BatchTranslationResult } from './ai/base/AITranslationService';

// Re-export interfaces for backward compatibility
export { ClassificationRequest, ClassificationResult };

// Wrapper functions that delegate to the new service architecture
export const translateText = async (request: TranslationRequest): Promise<TranslationResult> => {
  const service = await AIServiceFactory.createService();
  return service.translateText(request);
};

export const translateTextBatch = async (request: BatchTranslationRequest): Promise<BatchTranslationResult> => {
  const service = await AIServiceFactory.createService();
  return service.translateTextBatch(request);
};

export const classifySegments = async (request: ClassificationRequest): Promise<ClassificationResult> => {
  const service = await AIServiceFactory.createService();
  return service.classifySegments(request);
};

export const classifySegmentsBatch = async (request: ClassificationRequest): Promise<ClassificationResult> => {
  const service = await AIServiceFactory.createService();
  return service.classifySegmentsBatch(request);
};

// Legacy implementation - DEPRECATED (remove in next major version)
// All code below this line is preserved for reference but will be replaced by service architecture

/*
 * DEPRECATED: This file now serves as a compatibility wrapper.
 * The actual implementation has been moved to:
 * - /services/ai/providers/OpenAITranslationService.ts
 * - /services/ai/factory/AIServiceFactory.ts
 * 
 * New code should use AIServiceFactory.createService() directly.
 */

// Original implementation preserved for reference:
export const legacyTranslateText = async (request: TranslationRequest): Promise<TranslationResult> => {
  // This function is deprecated - use AIServiceFactory.createService() instead
  throw new Error('Legacy translateText is deprecated. Use AIServiceFactory.createService().translateText() instead.');
};