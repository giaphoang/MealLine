// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { PrismaClient } from '@prisma/client';
import DocxParser from './parser';
import { alertService } from '../alerts';
import { storageService } from '../storage';
import { randomUUID } from 'crypto';
import { storageReconciliationService } from '../storage/reconciliation';
import { DocxTextValidator } from './text-validation';
import StyleManager from './StyleManager';
import { AIServiceFactory } from '../ai/factory/AIServiceFactory';
import {
  STYLE_BOUNDARY,
  TranslationRequest,
  TranslationProgress,
  TranslatedSegment,
  TranslationResult,
  TextSegment,
  ValidationStats,
  SegmentOptions
} from './types';

class DocxTranslationService {
  private prisma: PrismaClient;
  private parser: DocxParser;
  private progressMap: Map<string, TranslationProgress>;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.parser = new DocxParser();
    this.progressMap = new Map();
  }

  /**
   * Gets the current progress of a translation
   * @param documentId The document ID
   * @param language The language name
   * @returns The current progress or null if not found
   */
  getProgress(documentId: number, language: string): TranslationProgress | null {
    const key = `${documentId}-${language}`;
    return this.progressMap.get(key) || null;
  }

  /**
   * Translates a DOCX document to multiple languages
   * @param request The translation request
   * @returns A promise that resolves when all translations are complete
   */
  async translateDocument(request: TranslationRequest): Promise<void> {
    try {
      const documentId = request.documentId;
      
      // Get the document from the database
      const document = await this.prisma.document.findUnique({
        where: { id: documentId }
      });

      if (!document) {
        throw new Error(`Document with ID ${documentId} not found`);
      }

      if (!document.storagePath) {
        throw new Error(`Document with ID ${documentId} has no content`);
      }

      try {
        // Read the file from storage
        const fileContent = await storageService.getFile(document.storagePath);
        
        // Parse the DOCX file and extract text
        const parseResult = await this.parser.extractText(fileContent);
        console.log(`Extracted ${parseResult.segments.length} segments from DOCX`);
        console.log(`Metadata: ${JSON.stringify(parseResult.metadata)}`);

        // Only proceed if we have segments to translate
        if (parseResult.segments.length === 0) {
          throw new Error('No text found in document to translate');
        }
        
        // Validate and filter segments that need translation
        const validationResult = DocxTextValidator.filterSegmentsForTranslation(parseResult.segments);
        console.log(`Filtered segments: ${validationResult.filteredSegments.length} for translation, ${validationResult.skippedSegments.length} skipped`);
        console.log(`Skip reasons: ${JSON.stringify(validationResult.skipReasons)}`);
        
        // If all segments were skipped, still proceed but with a warning
        if (validationResult.filteredSegments.length === 0 && validationResult.skippedSegments.length > 0) {
          console.warn('All segments were skipped due to validation. Document will be copied without changes.');
        }

        // Process each language in parallel
        await Promise.all(
          request.languages.map(async language => {
            // Filter out segments marked for skipping early to avoid any text swapping
            const skipFilterResult = await this.filterSkippedSegments(validationResult.filteredSegments, language, request.segmentOptions);
            
            return this.processLanguage(
              documentId,
              document.name,
              fileContent,
              language,
              parseResult.segments, // Pass all segments for reconstruction
              skipFilterResult.segmentsToTranslate, // Only translate non-skipped segments
              request.includeOriginalText || false,
              {
                skippedSegments: validationResult.skippedSegments.length,
                skipReasons: validationResult.skipReasons,
                skipTranslationSegments: skipFilterResult.skippedSegments.length,
                skipTranslationReasons: { 'Skip Translation Flag': skipFilterResult.skippedSegments.length }
              },
              request.segmentOptions,
              request.overwrite
            )
          })
        );
        
        // Update the document's lastTranslatedAt field
        await this.prisma.document.update({
          where: { id: documentId },
          data: { lastTranslatedAt: new Date() }
        });
      } catch (parseError) {
        // Update progress for all languages to failed state
        this.updateProgressForAllLanguages(request.documentId, request.languages, parseError);
        
        // Re-throw the error to be caught by the outer try-catch
        throw parseError;
      }
    } catch (error) {
      console.error('Error translating document:', error);
      throw error;
    }
  }

  /**
   * Updates progress for all languages to failed state
   */
  private updateProgressForAllLanguages(documentId: number, languages: string[], error: any): void {
    for (const language of languages) {
      const key = `${documentId}-${language}`;
      this.progressMap.set(key, {
        documentId: documentId,
        language: language,
        status: 'failed',
        progress: 0,
        message: error instanceof Error ? error.message : 'Failed to parse DOCX file'
      });
    }
  }

  /**
   * Filters out segments marked for skipping to prevent any text swapping
   * @param segments Segments to filter
   * @param language Target language
   * @param segmentOptions Advanced mode segment options
   * @returns Object with segments to translate and skipped segments
   */
  private async filterSkippedSegments(
    segments: TextSegment[], 
    language: string,
    segmentOptions?: SegmentOptions
  ): Promise<{
    segmentsToTranslate: TextSegment[];
    skippedSegments: TextSegment[];
  }> {
    const segmentsToTranslate: TextSegment[] = [];
    const skippedSegments: TextSegment[] = [];
    
    for (const segment of segments) {
      // Check if segment is marked to skip in advanced mode
      if (segmentOptions?.skipSegments?.includes(segment.text)) {
        console.log(`Skipping segment from advanced mode: "${segment.text.substring(0, 30)}${segment.text.length > 30 ? '...' : ''}"`);
        skippedSegments.push(segment);
        continue;
      }
      
      // Check database for existing skip translation flag
      const existingTranslation = await this.prisma.translation.findFirst({
        where: {
          originalText: segment.text,
          language,
          status: 'completed',
          skipTranslation: true
        },
        select: {
          skipTranslation: true
        }
      });
      
      if (existingTranslation && existingTranslation.skipTranslation) {
        console.log(`Skipping segment from database flag: "${segment.text.substring(0, 30)}${segment.text.length > 30 ? '...' : ''}"`);
        skippedSegments.push(segment);
      } else {
        segmentsToTranslate.push(segment);
      }
    }
    
    console.log(`Skip filter: ${segmentsToTranslate.length} segments to translate, ${skippedSegments.length} segments completely skipped`);
    return { segmentsToTranslate, skippedSegments };
  }

  /**
   * Updates progress for a translation
   */
  private updateProgress(key: string, progress: TranslationProgress): void {
    this.progressMap.set(key, progress);
  }

  /**
   * Processes translation for a single language
   */
  private async processLanguage(
    documentId: number,
    documentName: string,
    content: Buffer,
    language: string,
    allSegments: TextSegment[], // All segments for document reconstruction
    segmentsToTranslate: TextSegment[], // Only segments that need translation
    includeOriginalText: boolean,
    validationStats?: ValidationStats,
    segmentOptions?: SegmentOptions,
    overwrite?: boolean
  ): Promise<void> {
    const key = `${documentId}-${language}`;
    
    try {
      // Initialize progress tracking
      this.updateProgress(key, {
        documentId,
        language,
        status: 'pending',
        progress: 0,
        message: 'Translation queued'
      });

      // Check for existing translation (skip if already exists, unless overwrite is true)
      if (await this.checkExistingTranslation(documentId, language, key, overwrite)) {
        return;
      }

      // Update progress
      this.updateProgress(key, {
        documentId,
        language,
        status: 'processing',
        progress: 5,
        message: 'Preparing for translation',
        warnings: undefined // Clear any previous warnings
      });
      
      // Process the segments and get translations
      const { 
        translatedSegments, 
        cachedCount, 
        newTranslationsCount,
        totalSegments,
        hasFailures,
        failureDetails,
        warnings
      } = await this.processSegments(segmentsToTranslate, language, documentId, includeOriginalText, segmentOptions);

      // Check if we have critical failures
      if (hasFailures && failureDetails) {
        const errorMessages = failureDetails.map(f => f.error).filter((v, i, a) => a.indexOf(v) === i); // Get unique errors
        const failedCount = failureDetails.length;
        
        // Check if it's a total failure (no successful translations)
        if (newTranslationsCount === 0 && cachedCount === 0) {
          // Complete failure - update progress and throw error
          const errorMessage = errorMessages[0] || 'Translation failed';
          throw new Error(errorMessage);
        } else {
          // Partial success - log but continue
          console.warn(`Partial translation failure for ${language}: ${failedCount} segments failed`);
          
          // Update progress to show partial failure
          this.updateProgress(key, {
            documentId,
            language,
            status: 'processing',
            progress: 85,
            message: `Translation completed with ${failedCount} failed segments`,
            stats: {
              total: totalSegments,
              cached: cachedCount,
              newTranslations: newTranslationsCount,
              failed: failedCount
            },
            warnings
          });
        }
      }

      // Generate and save the translated document
      await this.generateAndSaveTranslatedDocument(
        documentId,
        documentName,
        language,
        content,
        allSegments, // Pass all segments for reconstruction
        translatedSegments, // Only translated segments
        segmentsToTranslate.length, // Count of segments processed
        totalSegments,
        cachedCount,
        newTranslationsCount,
        key,
        validationStats,
        hasFailures ? failureDetails : undefined,
        warnings
      );
      
    } catch (error) {
      console.error(`Error processing language ${language} for document ${documentId}:`, error);
      
      // Update progress with error
      this.updateProgress(key, {
        documentId,
        language,
        status: 'failed',
        progress: 0,
        message: error instanceof Error ? error.message : 'Translation failed'
      });

      // Create alert for the failure
      await alertService.createAlert('error', `Failed to translate document ${documentId} to ${language}`);
    }
  }

  /**
   * Checks if a translation already exists and updates progress if it does
   * @param overwrite Whether to overwrite existing translations
   * @returns true if translation exists (and should skip), false otherwise
   */
  private async checkExistingTranslation(
    documentId: number, 
    language: string, 
    key: string,
    overwrite?: boolean
  ): Promise<boolean> {
    const existingDoc = await this.prisma.translatedDocument.findFirst({
      where: {
        documentId,
        language
      }
    });

    if (existingDoc) {
      if (overwrite) {
        console.log(`Translation for document ${documentId} to ${language} already exists. Overwriting.`);
        // Delete existing translation to allow overwrite
        await this.deleteTranslation(documentId, language, { preserveTranslations: true }); // preserve cached translations
        return false; // Proceed with translation
      } else {
        console.log(`Translation for document ${documentId} to ${language} already exists. Skipping.`);
        this.updateProgress(key, {
          documentId,
          language,
          status: 'completed',
          progress: 100,
          message: 'Translation already exists'
        });
        return true; // Skip translation
      }
    }
    
    return false;
  }

  /**
   * Processes all segments for translation with batching
   */
  private async processSegments(
    segments: TextSegment[],
    language: string,
    documentId: number,
    includeOriginalText: boolean,
    segmentOptions?: SegmentOptions
  ): Promise<{
    translatedSegments: TranslatedSegment[];
    cachedCount: number;
    newTranslationsCount: number;
    totalSegments: number;
    hasFailures?: boolean;
    failureDetails?: Array<{ text: string; error: string }>;
    warnings?: string[];
  }> {
    const totalSegments = segments.length;
    const translatedSegments: TranslatedSegment[] = [];
    const allFailedSegments: Array<{ text: string; error: string }> = [];
    const allWarnings: string[] = [];
    
    // Stats for tracking cache hits/misses
    let cachedCount = 0;
    let newTranslationsCount = 0;

    // Group segments by uniqueness to avoid redundant translations
    const uniqueSegments = this.groupSegmentsByText(segments);
    console.log(`Found ${uniqueSegments.size} unique text segments out of ${totalSegments} total segments`);
    
    const key = `${documentId}-${language}`;
    
    // Pre-fetch all existing translations in a single query
    const textsToCheck = Array.from(uniqueSegments.keys());
    const existingTranslations = await this.bulkFindExistingTranslations(textsToCheck, language);
    console.log(`Found ${existingTranslations.size} cached translations out of ${textsToCheck.length} unique texts`);
    
    // Separate cached from non-cached segments
    const segmentsToTranslate: Array<{ text: string; segmentGroup: TextSegment[] }> = [];
    
    for (const [text, segmentGroup] of uniqueSegments.entries()) {
      // Check if user wants to bypass cache
      const shouldBypassCache = segmentOptions?.bypassCache?.includes(text);
      
      if (!shouldBypassCache && existingTranslations.has(text)) {
        // Use cached translation
        const cachedTranslation = existingTranslations.get(text)!;
        for (const segment of segmentGroup) {
          translatedSegments.push({
            id: segment.id,
            text: segment.text,
            translatedText: cachedTranslation.translatedText,
            language,
            positions: segment.positions,
            paragraphIndex: segment.paragraphIndex
          });
        }
        cachedCount += segmentGroup.length;
      } else {
        // Add to batch for translation
        segmentsToTranslate.push({ text, segmentGroup });
      }
    }
    
    console.log(`Using cache for ${cachedCount} segments, translating ${segmentsToTranslate.length} unique texts`);
    
    // Process segments in batches
    const BATCH_SIZE = 15; // Optimal batch size for OpenAI API
    const batches = this.createBatches(segmentsToTranslate, BATCH_SIZE);
    
    let batchIndex = 0;
    for (const batch of batches) {
      batchIndex++;
      
      // Update progress
      this.updateProgress(key, {
        documentId,
        language,
        progress: Math.round((batchIndex / batches.length) * 80) + 5,
        status: 'processing',
        message: `Processing batch ${batchIndex} of ${batches.length}`,
        stats: {
          total: totalSegments,
          cached: cachedCount,
          newTranslations: newTranslationsCount
        }
      });
      
      // Translate batch - now returns failure info if applicable
      const batchResult = await this.translateBatch(
        batch, language, documentId, includeOriginalText, segmentOptions
      );
      
      // Add results
      translatedSegments.push(...batchResult.segments);
      newTranslationsCount += batchResult.newTranslationsCount;
      
      // Track any failures
      if (batchResult.failedSegments) {
        allFailedSegments.push(...batchResult.failedSegments);
      }
      
      // Track any warnings (deduplicate)
      if (batchResult.warnings) {
        for (const warning of batchResult.warnings) {
          if (!allWarnings.includes(warning)) {
            allWarnings.push(warning);
          }
        }
      }
    }
    
    return { 
      translatedSegments, 
      cachedCount, 
      newTranslationsCount, 
      totalSegments,
      hasFailures: allFailedSegments.length > 0,
      failureDetails: allFailedSegments.length > 0 ? allFailedSegments : undefined,
      warnings: allWarnings.length > 0 ? allWarnings : undefined
    };
  }
  
  /**
   * Groups segments by their text content to avoid duplicate translations
   */
  private groupSegmentsByText(segments: TextSegment[]): Map<string, TextSegment[]> {
    const uniqueSegments = new Map<string, TextSegment[]>();
    
    for (const segment of segments) {
      const trimmedText = segment.text.trim();
      if (!trimmedText) continue;
      
      if (!uniqueSegments.has(trimmedText)) {
        uniqueSegments.set(trimmedText, []);
      }
      uniqueSegments.get(trimmedText)!.push(segment);
    }
    
    return uniqueSegments;
  }
  
  /**
   * Processes a single text segment - either uses cached translation or translates it
   */
  private async processSegment(
    text: string,
    segmentGroup: TextSegment[],
    language: string,
    documentId: number,
    includeOriginalText: boolean,
    segmentOptions?: SegmentOptions
  ): Promise<{
    segments: TranslatedSegment[];
    cachedCount: number;
    newTranslationsCount: number;
  }> {
    const segments: TranslatedSegment[] = [];
    
    // Check if user wants to bypass cache for this segment
    const shouldBypassCache = segmentOptions?.bypassCache?.includes(text);
    
    if (shouldBypassCache) {
      console.log(`Bypassing cache for segment: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`); 
      // Force fresh translation with current user preferences
      const segmentIncludeEnglish = segmentOptions?.includeEnglishSegments?.includes(text) || includeOriginalText;
      return this.translateSegmentWithAPI(text, segmentGroup, language, documentId, segmentIncludeEnglish);
    }
    
    // Check if a translation already exists for this document type
    const existingTranslation = await this.findExistingTranslation(text, language);
    
    if (existingTranslation) {
    // Use existing document translation as-is, respecting original user preferences
    console.log(`Using existing document translation (type: ${existingTranslation.type}) for "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}", preserving original format`);
    
    // Process all segments with the existing translation unchanged
    // Skip includeOriginalText logic to respect original user choices for cached translations
    for (const segment of segmentGroup) {
    segments.push({
      id: segment.id,
      text: segment.text,
    translatedText: existingTranslation.translatedText, // Use cached translation unchanged
      language,
      positions: segment.positions, // Preserve position information
      paragraphIndex: segment.paragraphIndex // Preserve paragraph index
    });
    }
    
    return {
    segments,
    cachedCount: segmentGroup.length,
    newTranslationsCount: 0
    };
    } else {
      // Translate the segment using the translation API
      // Check if this specific segment should include English
      const segmentIncludeEnglish = segmentOptions?.includeEnglishSegments?.includes(text) || includeOriginalText;
      return this.translateSegmentWithAPI(text, segmentGroup, language, documentId, segmentIncludeEnglish);
    }
  }
  
  /**
   * Translates a segment using the translation API
   */
  private async translateSegmentWithAPI(
    text: string,
    segmentGroup: TextSegment[],
    language: string,
    documentId: number,
    includeOriginalText: boolean
  ): Promise<{
    segments: TranslatedSegment[];
    cachedCount: number;
    newTranslationsCount: number;
    warnings?: string[];
  }> {
    console.log(`No existing translation found for "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`);
    const segments: TranslatedSegment[] = [];
    
    // If the text contains style boundaries, provide special instructions
    const hasStyleBoundaries = text.includes(STYLE_BOUNDARY);
    let translationResult;
    
    if (hasStyleBoundaries) {
      translationResult = await this.translateWithStyleBoundaries(text, language);
    } else {
      // Regular translation without style boundaries
      const service = await AIServiceFactory.createService();
      translationResult = await service.translateText({
        text,
        targetLanguage: language
      });
    }
    
    // Prepare the translated text, including original if requested
    let finalTranslatedText = translationResult.translatedText;
    if (includeOriginalText) {
      finalTranslatedText = `${translationResult.translatedText} (${text})`;
    }
    
    // Save the new translation with type "Generated" and associate with the document
    await this.saveTranslation(text, finalTranslatedText, language, translationResult.metrics, documentId);
    
    // Add the translation for each instance of this text
    for (const segment of segmentGroup) {
    segments.push({
    id: segment.id,
    text: segment.text,
    translatedText: finalTranslatedText,
    language,
      positions: segment.positions, // Preserve position information
        paragraphIndex: segment.paragraphIndex // Preserve paragraph index
        });
      }

    // Check for alerts
    await alertService.checkResponseTime(translationResult.metrics.duration);
    
    return {
      segments,
      cachedCount: 0,
      newTranslationsCount: segmentGroup.length,
      warnings: translationResult.warnings ? translationResult.warnings : undefined
    };
  }
  
  /**
   * Handles translation of text with style boundaries
   */
  private async translateWithStyleBoundaries(text: string, language: string): Promise<TranslationResult> {
    // Count boundaries for logging
    const boundaryCount = StyleManager.countBoundaries(text);
    console.log(`Text contains ${boundaryCount} style boundaries that need to be preserved`);
    
    // Replace boundaries with special markers for translation
    const textForTranslation = StyleManager.convertBoundariesToMarkers(text);
    
    // Add special instructions for translation
    const service = await AIServiceFactory.createService();
    const translationResult = await service.translateText({
      text: textForTranslation,
      targetLanguage: language,
      instructions: StyleManager.getTranslationInstructions()
    });
    
    // Replace the visible markers back with our internal style boundary markers
    const processedTranslation = StyleManager.restoreBoundariesFromMarkers(translationResult.translatedText);
    
    // Update the translation result with our processed text
    translationResult.translatedText = processedTranslation;
    
    console.log(`Replaced boundary markers in translated text: '${processedTranslation.substring(0, 50)}${processedTranslation.length > 50 ? '...' : ''}'`);
    
    return translationResult;
  }
  
  /**
   * Prepares segment text with preserved spacing
   * @param segments Array of segments to prepare
   * @returns Array of segments with spacing properly handled
   */
  private prepareSegmentsWithSpacing(segments: TranslatedSegment[]): TranslatedSegment[] {
    // Create a map for quick lookup by ID
    const segmentMap = new Map<string, TranslatedSegment>();
    segments.forEach(segment => segmentMap.set(segment.id, segment));
    
    // Clone the segments to avoid modifying the originals
    const preparedSegments = segments.map(segment => ({
      ...segment,
      translatedText: segment.translatedText
    }));
    
    // Process segments that need space boundaries
    for (let i = 0; i < preparedSegments.length; i++) {
      const segment = preparedSegments[i];
      const originalSegment = segmentMap.get(segment.id);
      
      if (originalSegment && originalSegment.text && originalSegment.hasTrailingSpace) {
        // For segments marked with hasTrailingSpace, ensure there's a trailing space
        // but only if the segment doesn't already end with a space
        if (!segment.translatedText.endsWith(' ')) {
          console.log(`Adding trailing space to segment ${segment.id}`);
          segment.translatedText = segment.translatedText + ' ';
        }
      }
      
      // Fix potential issues with STYLE_BOUNDARY markers
      if (StyleManager.hasBoundaries(segment.translatedText)) {
        segment.translatedText = StyleManager.normalizeSpacingAroundBoundaries(segment.translatedText);
        console.log(`Fixed spacing around style boundaries in segment ${segment.id}`);
      }
    }
    
    return preparedSegments;
  }
  
  /**
   * Generates and saves the translated document
   */
  private async generateAndSaveTranslatedDocument(
    documentId: number,
    documentName: string,
    language: string,
    content: Buffer,
    allSegments: TextSegment[], // All segments for reconstruction
    translatedSegments: TranslatedSegment[], // Only translated segments
    segmentCount: number,
    totalSegments: number,
    cachedCount: number,
    newTranslationsCount: number,
    key: string,
    validationStats?: ValidationStats,
    failureDetails?: Array<{ text: string; error: string }>,
    warnings?: string[]
  ): Promise<void> {
    // Update progress with stats including validation information
    this.updateProgress(key, {
    documentId,
    language,
    status: 'processing',
    progress: 85,
    message: 'Creating translated document',
    stats: {
    total: totalSegments,
    cached: cachedCount,
    newTranslations: newTranslationsCount,
      skipped: validationStats?.skippedSegments || 0,
        skipReasons: validationStats?.skipReasons
        }
      });
    
    console.log(`Translation stats for ${language}: ${cachedCount} segments from cache, ${newTranslationsCount} new translations`);

    // Prepare segments with proper spacing
    const preparedSegments = this.prepareSegmentsWithSpacing(translatedSegments);
    
    // Generate the translated document with partial translation support
    const translatedBuffer = await this.parser.createTranslatedDocument(content, allSegments, preparedSegments);

    // Update progress
    this.updateProgress(key, {
      documentId,
      language,
      status: 'processing',
      progress: 95,
      message: 'Saving translated document'
    });

    // Create a filename for the translated document
    const fileName = `${documentName.replace(/\.docx$/i, '')}_${language}.docx`;
    console.log(`DocxTranslationService: Generated filename for translated document: ${fileName}`);
    
    // Generate a UUID for the translated document
    const uuid = randomUUID();
    
    // Save the translated document to storage
    const storageInfo = await storageService.saveFile(
      translatedBuffer, 
      uuid, 
      'translations'
    );

    console.log(`DocxTranslationService: Translation completed for document ${documentId} to ${language}, buffer size: ${translatedBuffer.byteLength} bytes`);
    
    // Save the translated document to the database
    await this.prisma.translatedDocument.create({
    data: {
    fileName,
    uuid,
    storagePath: storageInfo.storagePath,
    fileSize: storageInfo.fileSize,
    documentId,
    language,
    metadata: {
    segmentCount,
    translatedSegments: translatedSegments.length,
    createdAt: new Date().toISOString(),
      skippedSegments: validationStats?.skippedSegments || 0,
        skipReasons: validationStats?.skipReasons || {}
        }
          }
        });

    // Update progress with final stats including validation information and failures
    const hasFailures = failureDetails && failureDetails.length > 0;
    this.updateProgress(key, {
      documentId,
      language,
      status: hasFailures ? 'completed' : 'completed',
      progress: 100,
      message: hasFailures 
        ? `Translation completed with ${failureDetails.length} segments using fallback text`
        : 'Translation completed',
      stats: {
        total: totalSegments,
        cached: cachedCount,
        newTranslations: newTranslationsCount,
        skipped: validationStats?.skippedSegments || 0,
        skipReasons: validationStats?.skipReasons,
        failed: failureDetails?.length || 0
      },
      warnings
    });
    
    console.log(`Translation for document ${documentId} to ${language} completed${hasFailures ? ' with failures' : ''}`);
  }

  /**
   * Checks if a translation already exists in the database for document translation
   * Only searches within 'Generated' type translations to isolate document translations
   * @param text The text to translate
   * @param language The target language
   * @returns The existing translation or null if not found
   */
  private async findExistingTranslation(text: string, language: string): Promise<{ translatedText: string; type: string } | null> {
    // Check for existing translation only within 'Generated' type (document translations)
    // This isolates document translations from other content types (Food Items, Categories, Custom)
    // Skip translations are filtered out early, so we don't need to check skipTranslation here
    const existingTranslation = await this.prisma.translation.findFirst({
      where: {
        originalText: text,
        language,
        type: 'Generated', // Only look for document translations
        status: 'completed',
        skipTranslation: { not: true } // Exclude skipped translations as they're filtered early
      },
      select: {
        translatedText: true,
        type: true
      }
    });

    if (existingTranslation?.translatedText) {
      return {
        translatedText: existingTranslation.translatedText,
        type: existingTranslation.type
      };
    }

    return null;
  }

  /**
   * Saves a translation to the database with type "Generated"
   * @param originalText The original text
   * @param translatedText The translated text
   * @param language The language code
   * @param metrics Translation metrics
   * @param documentId Optional document ID to associate with the translation
   */
  private async saveTranslation(
    originalText: string,
    translatedText: string,
    language: string,
    metrics: {
      duration: number;
      promptTokens: number;
      completionTokens: number;
      totalCost: number;
    },
    documentId?: number
  ): Promise<void> {
    await this.prisma.translation.upsert({
      where: {
        translation_unique_combo: {
          originalText,
          language,
          type: 'Generated'
        }
      },
      create: {
        originalText,
        translatedText,
        language,
        type: 'Generated',
        status: 'completed',
        promptTokens: metrics.promptTokens,
        completionTokens: metrics.completionTokens,
        totalCost: metrics.totalCost,
        documentId: documentId || null // Associate with document if provided
      },
      update: {
        translatedText,
        status: 'completed',
        promptTokens: metrics.promptTokens,
        completionTokens: metrics.completionTokens,
        totalCost: metrics.totalCost,
        documentId: documentId || null // Update document association
      }
    });
  }

  /**
   * Gets all translations for a document
   * @param documentId The document ID
   * @returns An array of translated documents
   */
  async getTranslations(documentId: number) {
    return this.prisma.translatedDocument.findMany({
      where: { documentId },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Gets a specific translation
   * @param documentId The document ID
   * @param language The language name
   * @returns The translated document or null if not found
   */
  async getTranslation(documentId: number, language: string) {
    const translation = await this.prisma.translatedDocument.findFirst({
      where: {
        documentId,
        language
      }
    });
    
    if (translation) {
      console.log(`DocxTranslationService: Found translation for document ${documentId}, language ${language}`);
    } else {
      console.log(`DocxTranslationService: No translation found for document ${documentId}, language ${language}`);
    }
    
    return translation;
  }
  
  /**
   * Gets the count of cached translations for a document or a specific translation
   * @param documentId The document ID
   * @param language Optional language to filter by
   * @returns The count of cached translations
   */
  async getCachedTranslationsCount(documentId: number, language?: string) {
    const whereClause: any = { documentId: documentId };
    
    // Add language filter if specified
    if (language) {
      whereClause.language = language;
    }
    
    const count = await this.prisma.translation.count({
      where: whereClause
    });
    
    console.log(`Found ${count} cached translations for document ${documentId}${language ? `, language ${language}` : ''}`);
    
    return count;
  }

  /**
   * Gets the content of a translated document
   * @param documentId The document ID
   * @param language The language name
   * @returns The content of the translated document
   */
  async getTranslationContent(documentId: number, language: string): Promise<Buffer> {
    const translation = await this.getTranslation(documentId, language);
    
    if (!translation) {
      throw new Error(`Translation for document ${documentId} with language ${language} not found`);
    }
    
    if (!translation.storagePath) {
      throw new Error(`Translation has no content`);
    }
    
    // Verify integrity before fetching
    const exists = await storageService.verifyIntegrity(translation.storagePath);
    if (!exists) {
      // Update metadata to reflect integrity issue
      await this.prisma.translatedDocument.update({
        where: { id: translation.id },
        data: {
          metadata: {
            ...translation.metadata as object,
            integrityIssue: true,
            lastCheckAt: new Date().toISOString()
          }
        }
      });
      
      // Attempt reconciliation when a file is missing
      const error = new Error(`Translation file not found at ${translation.storagePath}`);
      console.error(`Error retrieving translation file: ${error.message}`);
      
      try {
        console.log(`Triggering storage reconciliation for missing translation file`);
        await storageReconciliationService.reconcileAfterError(
          'download',
          'translation',
          `${documentId}-${language}`,
          error
        );
      } catch (reconciliationError) {
        console.error(`Reconciliation error:`, reconciliationError);
      }
      
      throw error;
    }
    
    return storageService.getFile(translation.storagePath);
  }

  /**
   * Deletes a specific translation for a document
   * @param documentId The document ID
   * @param language The language name
   * @param options.preserveTranslations Whether to preserve cached translations (default: false)
   * @returns A promise that resolves when the translation is deleted
   */
  async deleteTranslation(documentId: number, language: string, options: { preserveTranslations?: boolean } = {}): Promise<void> {
    const { preserveTranslations = false } = options;
    try {
      console.log(`DocxTranslationService: Deleting translation for document ${documentId}, language ${language}`);
      
      // Find the translation
      const translation = await this.prisma.translatedDocument.findFirst({
        where: {
          documentId,
          language
        }
      });
      
      if (!translation) {
        throw new Error(`Translation for document ${documentId} with language ${language} not found`);
      }
      
      // Delete the file if it exists
      if (translation.storagePath) {
        try {
          await storageService.deleteFile(translation.storagePath);
          console.log(`Deleted file: ${translation.storagePath}`);
        } catch (err) {
          console.error(`Failed to delete translation file: ${translation.storagePath}`, err);
          // Continue even if file deletion fails
        }
      }
      
      // Handle cached translations based on preserveTranslations option
      if (!preserveTranslations) {
        // Count cached translations for this document-language combination
        const cachedTranslationsCount = await this.prisma.translation.count({
          where: {
            documentId: documentId,
            language: language
          }
        });
        
        if (cachedTranslationsCount > 0) {
          // Delete cached translations instead of just disassociating them
          await this.prisma.translation.deleteMany({
            where: {
              documentId: documentId,
              language: language
            }
          });
          
          console.log(`Deleted ${cachedTranslationsCount} cached translations for document ${documentId}, language ${language}`);
        }
      } else {
        console.log(`Preserving cached translations for document ${documentId}, language ${language}`);
      }
      
      // Delete the translation from the database
      const result = await this.prisma.translatedDocument.delete({
        where: { id: translation.id }
      });
      
      console.log(`DocxTranslationService: Deleted translation (ID ${translation.id})${preserveTranslations ? ' (preserved cached translations)' : ''}`);
      
      // Remove from progress map if it exists
      const key = `${documentId}-${language}`;
      if (this.progressMap.has(key)) {
        this.progressMap.delete(key);
      }
    } catch (error) {
      console.error(`Error deleting translation for document ${documentId}, language ${language}:`, error);
      
      // Trigger reconciliation on translation delete errors
      try {
        console.log(`Triggering storage reconciliation after translation delete error`);
        await storageReconciliationService.reconcileAfterError(
          'delete',
          'translation',
          `${documentId}-${language}`,
          error instanceof Error ? error : new Error(String(error))
        );
      } catch (reconciliationError) {
        console.error(`Reconciliation error:`, reconciliationError);
      }
      
      throw error;
    }
  }
  
  /**
   * Bulk fetch existing translations for performance optimization
   */
  private async bulkFindExistingTranslations(
    texts: string[], 
    language: string
  ): Promise<Map<string, { translatedText: string; type: string }>> {
    const existingTranslations = await this.prisma.translation.findMany({
      where: {
        originalText: { in: texts },
        language,
        type: 'Generated',
        status: 'completed',
        skipTranslation: { not: true }
      },
      select: {
        originalText: true,
        translatedText: true,
        type: true
      }
    });
    
    const translationMap = new Map<string, { translatedText: string; type: string }>();
    for (const translation of existingTranslations) {
      if (!translation.translatedText) {
        continue;
      }

      translationMap.set(translation.originalText, {
        translatedText: translation.translatedText,
        type: translation.type
      });
    }
    
    return translationMap;
  }
  
  /**
   * Create batches of segments for processing
   */
  private createBatches<T>(
    items: T[], 
    batchSize: number
  ): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }
  
  /**
   * Translate a batch of segments using batch API with retry logic
   */
  private async translateBatch(
    batch: Array<{ text: string; segmentGroup: TextSegment[] }>,
    language: string,
    documentId: number,
    includeOriginalText: boolean,
    segmentOptions?: SegmentOptions
  ): Promise<{
    segments: TranslatedSegment[];
    newTranslationsCount: number;
    failedSegments?: Array<{ text: string; error: string }>;
    warnings?: string[];
  }> {
    const segments: TranslatedSegment[] = [];
    const MAX_RETRIES = 3;
    const BASE_DELAY = 1000; // Start with 1 second delay
    
    // Get AI service instance
    const service = await AIServiceFactory.createService();
    
    // Prepare batch request
    const batchTexts = batch.map((item, index) => {
      const hasStyleBoundaries = item.text.includes(STYLE_BOUNDARY);
      return {
        id: `batch-${index}`,
        text: hasStyleBoundaries ? StyleManager.convertBoundariesToMarkers(item.text) : item.text,
        instructions: hasStyleBoundaries ? StyleManager.getTranslationInstructions() : undefined
      };
    });
    
    let lastError: Error | null = null;
    let batchResult: any = null;
    
    // Retry logic with exponential backoff
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        // Call batch translation API
        batchResult = await service.translateTextBatch({
          texts: batchTexts,
          targetLanguage: language
        });
        
        // Success - break out of retry loop
        lastError = null;
        break;
      } catch (error) {
        lastError = error as Error;
        console.error(`Batch translation attempt ${attempt + 1}/${MAX_RETRIES} failed:`, error);
        
        // Check if error is retryable
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isRetryableError = (
          errorMessage.includes('rate limit') ||
          errorMessage.includes('timeout') ||
          errorMessage.includes('503') ||
          errorMessage.includes('502') ||
          errorMessage.includes('500') ||
          errorMessage.includes('network')
        );
        
        // Don't retry for non-retryable errors (invalid API key, model access, etc.)
        if (!isRetryableError) {
          console.error('Non-retryable error detected, stopping retry attempts');
          break;
        }
        
        // Don't wait after the last failed attempt
        if (attempt < MAX_RETRIES - 1) {
          const delay = BASE_DELAY * Math.pow(2, attempt); // Exponential backoff
          console.log(`Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // If all retries failed, handle the failure
    if (lastError && !batchResult) {
      console.error(`All ${MAX_RETRIES} translation attempts failed for batch`);
      
      // Return failed segments info
      const failedSegments = batch.map(item => ({
        text: item.text.substring(0, 50) + (item.text.length > 50 ? '...' : ''),
        error: lastError.message
      }));
      
      // Still add segments but with original text (fallback)
      for (const { text, segmentGroup } of batch) {
        for (const segment of segmentGroup) {
          segments.push({
            id: segment.id,
            text: segment.text,
            translatedText: segment.text, // Use original text as fallback
            language,
            positions: segment.positions,
            paragraphIndex: segment.paragraphIndex
          });
        }
      }
      
      return {
        segments,
        newTranslationsCount: 0,
        failedSegments
      };
    }
    
    // Extract warnings from the result if present
    const warnings = batchResult?.warnings || [];
    
    // Process successful results and save translations
    const savePromises: Promise<void>[] = [];
    
    for (let i = 0; i < batch.length; i++) {
      const { text, segmentGroup } = batch[i];
      const translation = batchResult.translations.find((t: { id: string; translatedText: string }) => t.id === `batch-${i}`);
      
      if (!translation) {
        console.error(`No translation found for batch item ${i}`);
        continue;
      }
      
      // Restore style boundaries if needed
      let translatedText = translation.translatedText;
      if (text.includes(STYLE_BOUNDARY)) {
        translatedText = StyleManager.restoreBoundariesFromMarkers(translatedText);
      }
      
      // Apply include original text logic
      const segmentIncludeEnglish = segmentOptions?.includeEnglishSegments?.includes(text) || includeOriginalText;
      if (segmentIncludeEnglish) {
        translatedText = `${translatedText} (${text})`;
      }
      
      // Save translation to database (non-blocking)
      savePromises.push(this.saveTranslation(
        text, 
        translatedText, 
        language, 
        {
          duration: batchResult.metrics.duration / batch.length, // Distribute duration
          promptTokens: Math.ceil(batchResult.metrics.promptTokens / batch.length),
          completionTokens: Math.ceil(batchResult.metrics.completionTokens / batch.length),
          totalCost: batchResult.metrics.totalCost / batch.length
        },
        documentId
      ));
      
      // Add translated segments
      for (const segment of segmentGroup) {
        segments.push({
          id: segment.id,
          text: segment.text,
          translatedText,
          language,
          positions: segment.positions,
          paragraphIndex: segment.paragraphIndex
        });
      }
    }
    
    // Wait for all saves to complete
    await Promise.all(savePromises);
    
    // Check alerts once per batch
    await alertService.checkResponseTime(batchResult.metrics.duration);
    
    return {
      segments,
      newTranslationsCount: segments.length,
      failedSegments: undefined,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }
  
  // Alias for backward compatibility with documentation
  async translateTemplate(request: TranslationRequest): Promise<void> {
    console.warn('translateTemplate is deprecated. Use translateDocument instead.');
    return this.translateDocument(request);
  }
}

export default DocxTranslationService;
