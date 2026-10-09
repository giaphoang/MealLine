// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import express from 'express';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import DocumentService from '../services/document';
import DocumentUploadService from '../services/document/upload';
import { docxTranslationService } from '../services/docx';
import { storageService } from '../services/storage';
import { AIServiceFactory } from '../services/ai/factory/AIServiceFactory';
import { ensureProviderAccess } from '../services/ai/provider-access';
import FormattingChoiceService from '../services/formatting-choice';

const router = express.Router();
const prisma = new PrismaClient();
const documentService = new DocumentService(prisma);
const uploadService = new DocumentUploadService(prisma);
const formattingChoiceService = new FormattingChoiceService(prisma);

// Initialize services
(async () => {
  try {
    await storageService.initialize();
    await documentService.initialize();
    console.log('Document routes: Services initialized successfully');
  } catch (error) {
    console.error('Document routes: Failed to initialize services', error);
  }
})();

// Configure multer for memory storage with error handling
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Only accept docx files
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      cb(null, true);
    } else {
      cb(new Error('Only DOCX files are supported'));
    }
  }
});

// Get all documents
router.get('/', async (req, res, next) => {
  try {
    const documents = await documentService.getAll();
    
    // Transform the documents to not include the binary content in the response
    const transformedDocuments = documents.map(document => {
      // Check for integrity issues in metadata
      const metadata = document.metadata as any || {};
      const hasIntegrityIssue = metadata.integrityIssue === true;
      const wasCleared = metadata.fileCleared === true;
      
      return {
        id: document.id,
        name: document.name,
        createdAt: document.createdAt.toISOString(),
        updatedAt: document.updatedAt.toISOString(),
        lastGeneratedAt: document.lastTranslatedAt ? document.lastTranslatedAt.toISOString() : null,
        // Add a flag to indicate if content is available
        hasContent: !!document.storagePath,
        // Add status information
        hasIntegrityIssue,
        wasCleared,
        // Add fileSize if content exists
        fileSize: document.fileSize ? `${Math.round(document.fileSize / 1024)} KB` : null,
      };
    });
    
    res.json(transformedDocuments);
  } catch (error) {
    next(error);
  }
});

// Get document by ID
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }
    
    const document = await documentService.getById(id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Check for integrity issues in metadata
    const metadata = document.metadata as any || {};
    const hasIntegrityIssue = metadata.integrityIssue === true;
    const wasCleared = metadata.fileCleared === true;
    
    // Get the count of cached translations for this document
    const cachedTranslationsCount = await docxTranslationService.getCachedTranslationsCount(id);
    
    // Transform the document to not include the binary content in the response
    const transformedDocument = {
      id: document.id,
      name: document.name,
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
      lastGeneratedAt: document.lastTranslatedAt ? document.lastTranslatedAt.toISOString() : null,
      hasContent: !!document.storagePath,
      // Add status information
      hasIntegrityIssue,
      wasCleared,
      fileSize: document.fileSize ? `${Math.round(document.fileSize / 1024)} KB` : null,
      // Add cached translation count
      cachedTranslationsCount,
    };
    
    res.json(transformedDocument);
  } catch (error) {
    next(error);
  }
});

// Create a new document (without file content)
router.post('/', async (req, res, next) => {
  try {
    const { name } = req.body;
    
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Document name is required' });
    }
    
    const document = await documentService.create({ name });
    
    res.status(201).json({
      id: document.id,
      name: document.name,
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
    });
  } catch (error: any) {
    // Handle specific errors
    if (error.message && error.message.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }
    next(error);
  }
});

// Update document
router.put('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }
    
    const { name } = req.body;
    
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Document name is required' });
    }
    
    const document = await documentService.update(id, { name });
    
    res.json({
      id: document.id,
      name: document.name,
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
      fileSize: document.fileSize ? `${Math.round(document.fileSize / 1024)} KB` : null,
    });
  } catch (error: any) {
    // Handle specific errors
    if (error.message && error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    if (error.message && error.message.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }
    next(error);
  }
});

// Delete document
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }
    
    // Get preserveTranslations option from query parameter
    const preserveTranslations = req.query.preserveTranslations === 'true';
    console.log(`Delete document ${id} with preserveTranslations=${preserveTranslations}`);
    
    await documentService.delete(id, { preserveTranslations });
    
    res.status(204).end();
  } catch (error: any) {
    // Handle specific errors
    if (error.message && error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

// Upload document file
router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }
    
    const { name } = req.body;
    
    const result = await uploadService.uploadDocument(req.file, name);
    
    res.status(201).json({
      id: result.id,
      name: result.name,
      fileSize: `${Math.round(result.fileSize / 1024)} KB`,
    });
  } catch (error: any) {
    // Handle specific errors
    if (error.message && error.message.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }
    if (error.message && error.message.includes('Only DOCX files')) {
      return res.status(400).json({ error: error.message });
    }
    if (error.message && error.message.includes('File size exceeds')) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

// Download document
router.get('/:id/download', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }
    
    const document = await documentService.getById(id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    console.log(`Download request for document ${id}, name ${document.name}`);
    
    if (!document.storagePath) {
      console.log(`Document has no content, id: ${id}`);
      return res.status(404).json({ error: 'Document has no content' });
    }
    
    // Get the file content
    try {
      const fileContent = await documentService.getDocumentContent(id);
      console.log(`Serving document: ${document.name}, size: ${fileContent.byteLength} bytes`);
      
      // Set headers for file download
      res.setHeader('Content-Type', document.contentType);
      
      // Sanitize the filename to ensure it's safe for headers
      // Only replace unsafe characters, preserving spaces
      const sanitizedName = document.name.replace(/[<>:"\/\\|?*]/g, '_');
      
      // Set a proper Content-Disposition header with the filename
      // RFC 6266 format for compatibility
      const encodedFilename = encodeURIComponent(sanitizedName);
      res.setHeader('Content-Disposition', `attachment; filename="${sanitizedName}.docx"; filename*=UTF-8''${encodedFilename}.docx`);
      
      console.log(`Setting Content-Disposition header: attachment; filename="${sanitizedName}.docx"; filename*=UTF-8''${encodedFilename}.docx`);
      
      // Send the file as a buffer
      res.send(fileContent);
    } catch (fileError) {
      console.error(`Error retrieving document file:`, fileError);
      return res.status(404).json({ error: 'Document file not found' });
    }
  } catch (error) {
    next(error);
  }
});

// Bulk delete documents
router.post('/bulk-delete', async (req, res, next) => {
  try {
    const { ids, preserveTranslations = false } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty document IDs array' });
    }
    
    console.log(`Bulk delete ${ids.length} documents with preserveTranslations=${preserveTranslations}`);
    
    const result = await documentService.bulkDelete(ids, { preserveTranslations });
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Extract segments from document for advanced translation mode
router.get('/:id/segments', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }
    
    // Get selected languages from query parameter
    const { languages } = req.query;
    const selectedLanguages = Array.isArray(languages)
      ? languages.flatMap(lang => typeof lang === 'string' ? lang.split(',') : [])
      : typeof languages === 'string'
        ? languages.split(',')
        : [];
    
    // Verify the document exists
    const document = await documentService.getById(id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    if (!document.storagePath) {
      return res.status(400).json({ error: 'Document has no content' });
    }
    
    // Get the file content
    const fileContent = await documentService.getDocumentContent(id);
    
    // Extract segments using the same parser as translation
    const DocxParser = require('../services/docx/parser').default;
    const parser = new DocxParser();
    const parseResult = await parser.extractText(fileContent);
    
    // Apply validation filtering to get both filtered and skipped segments
    const { DocxTextValidator } = require('../services/docx/text-validation');
    const validationResult = DocxTextValidator.filterSegmentsForTranslation(parseResult.segments);
    
    // Check for segments marked with skipTranslation and cache status in database
    const segmentsWithSkipInfo = await Promise.all(
      [...validationResult.filteredSegments, ...validationResult.skippedSegments].map(async (segment) => {
        // Check if this text has been marked for skipping in any language
        const skipTranslation = await prisma.translation.findFirst({
          where: {
            originalText: segment.text,
            skipTranslation: true
          },
          select: { skipTranslation: true }
        });
        
        // Check cache status across selected languages
        let hasCachedTranslation = false;
        if (selectedLanguages.length > 0) {
          const cachedTranslations = await prisma.translation.findMany({
            where: {
              originalText: segment.text,
              language: { in: selectedLanguages },
              type: 'Generated',
              status: 'completed',
              skipTranslation: { not: true }
            },
            select: { language: true }
          });
          hasCachedTranslation = cachedTranslations.length > 0;
        }
        
        return {
          id: segment.id,
          text: segment.text,
          paragraphIndex: segment.paragraphIndex,
          positions: segment.positions,
          isFiltered: validationResult.filteredSegments.includes(segment),
          isSkipped: validationResult.skippedSegments.includes(segment),
          hasSkipTranslation: !!skipTranslation?.skipTranslation,
          cacheStatus: {
            hasCachedTranslation
          }
        };
      })
    );
    
    // Group segments by unique text content to eliminate duplicates in UI
    const uniqueSegmentsMap = new Map();
    const segmentInstances = new Map(); // Track all instances of each unique text
    
    segmentsWithSkipInfo.forEach(segment => {
      const text = segment.text.trim();
      
      if (!uniqueSegmentsMap.has(text)) {
        // First instance becomes the representative
        uniqueSegmentsMap.set(text, {
          ...segment,
          instanceCount: 1
        });
        segmentInstances.set(text, [segment]);
      } else {
        // Track additional instances
        const existing = uniqueSegmentsMap.get(text);
        existing.instanceCount++;
        // Update cache status - if any instance has cache, mark as cached
        if (segment.cacheStatus.hasCachedTranslation) {
          existing.cacheStatus.hasCachedTranslation = true;
        }
        segmentInstances.get(text).push(segment);
      }
    });
    
    const uniqueSegments = Array.from(uniqueSegmentsMap.values());
    
    res.json({
      segments: uniqueSegments,
      segmentInstances: Object.fromEntries(segmentInstances),
      metadata: {
        totalSegments: parseResult.segments.length,
        filteredSegments: validationResult.filteredSegments.length,
        skippedSegments: validationResult.skippedSegments.length,
        uniqueSegments: uniqueSegments.length,
        ...parseResult.metadata
      }
    });
  } catch (error) {
    console.error('Error extracting segments:', error);
    next(error);
  }
});

// Translate document to specified languages
router.post('/:id/translate', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }
    
    const { languages, includeOriginalText = false, segmentOptions, overwrite = false } = req.body;
    
    if (!Array.isArray(languages) || languages.length === 0) {
      return res.status(400).json({ error: 'Languages array is required' });
    }
    
    // Validate all languages are provided as full names
    const invalidLanguages = languages.filter(lang => lang.length < 3 || /^[a-z]{2,3}$/i.test(lang));
    if (invalidLanguages.length > 0) {
      return res.status(400).json({ 
        error: `Please use full language names instead of codes: ${invalidLanguages.join(', ')}` 
      });
    }
    
    // Verify the document exists
    const document = await documentService.getById(id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    if (!document.storagePath) {
      return res.status(400).json({ error: 'Document has no content' });
    }
    
    // Confirm the provider will answer before kicking off an asynchronous
    // translation whose failure the user would otherwise discover minutes
    // later, described as a bad API key (ISSUES.md #84).
    try {
      await ensureProviderAccess('this document');
    } catch (error) {
      return next(error);
    }
    
    // Start the translation process asynchronously
    docxTranslationService.translateDocument({
      documentId: id,
      languages,
      includeOriginalText,
      segmentOptions,
      overwrite
    }).catch(error => {
      console.error('Translation process error:', error);
    });
    
    // Return immediate success response
    res.status(202).json({
      message: 'Translation process started',
      documentId: id,
      languages,
      includeOriginalText
    });
  } catch (error) {
    next(error);
  }
});

// Get translation progress
router.get('/:id/translate/progress', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }
    
    const { language } = req.query;
    
    if (!language || typeof language !== 'string') {
      return res.status(400).json({ error: 'Language query parameter is required' });
    }
    
    // Validate language is provided as a full name
    if (language.length < 3 || /^[a-z]{2,3}$/i.test(language)) {
      return res.status(400).json({ error: 'Please use full language name instead of code' });
    }
    
    // Get progress for the specified language
    const progress = docxTranslationService.getProgress(id, language);
    
    // Return default progress object instead of 404 error if progress not found
    if (!progress) {
      return res.json({
        documentId: id,
        language: language,
        status: 'pending',
        progress: 0,
        message: 'Translation not started or no progress available'
      });
    }
    
    res.json(progress);
  } catch (error) {
    next(error);
  }
});

// Get cached translation counts for a document
router.get('/:id/cached-translations/count', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }
    
    // Check if language is specified
    const { language } = req.query;
    let count: number;
    
    if (language && typeof language === 'string') {
      // Get count for specific language
      count = await docxTranslationService.getCachedTranslationsCount(id, language);
    } else {
      // Get total count
      count = await docxTranslationService.getCachedTranslationsCount(id);
    }
    
    res.json({ count });
  } catch (error) {
    next(error);
  }
});

// Get all translations for a document
router.get('/:id/translations', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }
    
    // Get all translations for the document
    const translations = await docxTranslationService.getTranslations(id);
    
    // Map translations to a simpler format without binary content
    const translationsResponse = await Promise.all(translations.map(async translation => {
      // Check for integrity issues in metadata
      const metadata = translation.metadata as any || {};
      const hasIntegrityIssue = metadata.integrityIssue === true;
      const wasCleared = metadata.fileCleared === true;
      
      // Get cached translation count for this translation
      const cachedTranslationsCount = await docxTranslationService.getCachedTranslationsCount(id, translation.language);
      
      return {
        id: translation.id,
        fileName: translation.fileName,
        language: translation.language,
        createdAt: translation.createdAt.toISOString(),
        // Add status information
        hasContent: !!translation.storagePath,
        hasIntegrityIssue,
        wasCleared,
        // Add fileSize
        fileSize: translation.fileSize ? `${Math.round(translation.fileSize / 1024)} KB` : '0 KB',
        // Add cached translation count
        cachedTranslationsCount
      };
    }));
    
    res.json(translationsResponse);
  } catch (error) {
    next(error);
  }
});

// Download a translated document
router.get('/:id/translations/:language/download', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }
    
    const { language } = req.params;
    console.log(`Download request for document ${id}, language ${language}`);
    
    // Validate language is provided as a full name
    if (language.length < 3 || /^[a-z]{2,3}$/i.test(language)) {
      return res.status(400).json({ error: 'Please use full language name instead of code' });
    }    
    try {
      // Get translation content
      const translation = await docxTranslationService.getTranslation(id, language);
      
      if (!translation) {
        console.log(`Translation not found for document ${id}, language ${language}`);
        return res.status(404).json({ error: 'Translation not found' });
      }
      
      // Get translation file content
      const fileContent = await docxTranslationService.getTranslationContent(id, language);
      console.log(`Serving translation: ${translation.fileName}, size: ${fileContent.byteLength} bytes`);
      
      // Set headers for file download
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      
      // Log the actual filename stored in the database
      console.log(`Original filename from database: ${translation.fileName}`);
      
      // Don't sanitize spaces and common characters in the filename - only replace unsafe characters
      const sanitizedName = translation.fileName.replace(/[<>:"\/\\|?*]/g, '_');
      
      // Set a proper Content-Disposition header with the filename
      // RFC 6266 format for compatibility
      const encodedFilename = encodeURIComponent(sanitizedName);
      
      // Use double quotes around filename and ensure proper formatting
      res.setHeader('Content-Disposition', `attachment; filename="${sanitizedName}"; filename*=UTF-8''${encodedFilename}`);
      
      console.log(`Setting Content-Disposition header: attachment; filename="${sanitizedName}"; filename*=UTF-8''${encodedFilename}`);
      
      // Send the file
      res.send(fileContent);
    } catch (fileError) {
      console.error('Error downloading translation:', fileError);
      return res.status(404).json({ error: 'Translation file not found' });
    }
  } catch (error) {
    console.error('Error downloading translation:', error);
    next(error);
  }
});

// Delete a specific translation for a document
router.delete('/:id/translations/:language', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }
    
    const { language } = req.params;
    if (!language) {
      return res.status(400).json({ error: 'Language name is required' });
    }
    
    // Validate language is provided as a full name
    if (language.length < 3 || /^[a-z]{2,3}$/i.test(language)) {
      return res.status(400).json({ error: 'Please use full language name instead of code' });
    }
    
    // Get preserveTranslations option from query parameter
    const preserveTranslations = req.query.preserveTranslations === 'true';
    console.log(`Delete translation for document ${id}, language ${language} with preserveTranslations=${preserveTranslations}`);
    
    // First check if document exists
    const document = await documentService.getById(id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Delete only the specified translation, not the original document
    await docxTranslationService.deleteTranslation(id, language, { preserveTranslations });
    
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});



// Optimized classification endpoint for Phase 2
router.post('/:id/classify-optimized', async (req, res, next) => {
  const startTime = Date.now();
  
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }
    
    const { segmentMap, extractionSessionId } = req.body as { segmentMap?: Record<string, unknown>; extractionSessionId?: unknown };
    
    if (!segmentMap || typeof segmentMap !== 'object') {
      return res.status(400).json({ error: 'segmentMap is required' });
    }
    
    if (!extractionSessionId || typeof extractionSessionId !== 'string') {
      return res.status(400).json({ error: 'extractionSessionId is required' });
    }
    
    const normalizedSegmentMap: Record<string, string[]> = {};
    Object.entries(segmentMap).forEach(([text, ids]) => {
      if (Array.isArray(ids)) {
        normalizedSegmentMap[text] = ids.map(String);
      }
    });

    if (Object.keys(normalizedSegmentMap).length === 0) {
      return res.status(400).json({ error: 'segmentMap must contain at least one segment' });
    }

    // Verify document exists
    const document = await documentService.getById(id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Get cached active CLASSIFICATION SystemPrompt
    const activePrompt = await prisma.systemPrompt.findFirst({
      where: {
        promptType: 'CLASSIFICATION',
        isActive: true
      }
    });
    
    if (!activePrompt) {
      return res.status(400).json({
        error: 'Auto-Format requires configuration. Please set up Document Auto-Format Rules in Tools → AI Configuration to define your classification preferences.'
      });
    }
    
    // Phase 2: Cache integration - lookup existing classifications if enabled
    const decisions: Record<string, 'skip' | 'include' | 'normal'> = {};
    const useCache = activePrompt.rememberFormattingChoices;
    let cachedCount = 0;
    let segmentsToClassify: { id: string; text: string; }[] = [];
    const textToSegmentIds: Record<string, string[]> = {};
    
    if (useCache) {
      // Build lookup map for cache queries
      Object.entries(normalizedSegmentMap).forEach(([text, ids]) => {
        textToSegmentIds[text] = ids;
      });
      
      // Query cache for existing classifications using FormattingChoice service
      const cachedClassifications = await formattingChoiceService.findCachedChoices(
        Object.keys(normalizedSegmentMap),
        activePrompt.id
      );
      
      // Apply cached decisions
      const cachedTexts = new Set<string>();
      cachedClassifications.forEach(cached => {
        const segmentIds = textToSegmentIds[cached.originalText];
        if (segmentIds && cached.classificationAction) {
          segmentIds.forEach(segmentId => {
            decisions[segmentId] = cached.classificationAction;
          });
          cachedTexts.add(cached.originalText);
          cachedCount++;
        }
      });
      
      // Prepare uncached segments for AI classification
      Object.entries(normalizedSegmentMap).forEach(([text, ids], index) => {
        if (!cachedTexts.has(text)) {
          segmentsToClassify.push({
            id: `unique_${index}`,
            text: text
          });
        }
      });
    } else {
      // No cache - classify all segments
      segmentsToClassify = Object.entries(normalizedSegmentMap).map(([text, ids], index) => ({
        id: `unique_${index}`,
        text: text
      }));
    }
    
    // Process AI classification for uncached segments (if any)
    if (segmentsToClassify.length > 0) {
      // Create the AI service, or fail with the provider's actual reason.
      let service;
      try {
        service = await ensureProviderAccess('this document');
      } catch (accessError) {
        return next(accessError);
      }


      // Call AI classification service for uncached segments
      const result = await service.classifySegmentsBatch({ segments: segmentsToClassify });
      
      // Apply threshold logic to AI results
      const skipThreshold = activePrompt.skipTranslationThreshold || 0.7;
      const includeThreshold = activePrompt.includeEnglishThreshold || 0.7;
      
      const newClassifications: { text: string; action: 'skip' | 'include' | 'normal' }[] = [];
      
      result.classifications.forEach((classification, index) => {
        const segment = segmentsToClassify[index];
        const text = segment.text;
        const segmentIds = textToSegmentIds[text] || normalizedSegmentMap[text] || [];
        
        const skipExceeds = classification.a >= skipThreshold;
        const includeExceeds = classification.b >= includeThreshold;
        
        let action: 'skip' | 'include' | 'normal';
        
        if (skipExceeds && includeExceeds) {
          action = classification.a >= classification.b ? 'skip' : 'include';
        } else if (skipExceeds) {
          action = 'skip';
        } else if (includeExceeds) {
          action = 'include';
        } else {
          action = 'normal';
        }
        
        // Apply action to all segment IDs with this text
        segmentIds.forEach(segmentId => {
          decisions[segmentId] = action;
        });
        
        // Store for cache writing
        newClassifications.push({ text, action });
      });
      
      // Phase 2: Cache write - store new classifications using FormattingChoice service
      if (useCache && newClassifications.length > 0) {
        const cacheChoices = newClassifications.map(item => ({
          originalText: item.text,
          classificationAction: item.action,
          confidence: undefined // Could be added from AI service response if available
        }));
        
        try {
          await formattingChoiceService.cacheBatchChoices(
            cacheChoices,
            activePrompt.id,
            id
          );
        } catch (error) {
          console.warn('Failed to cache classification results:', error);
          // Don't fail the request if caching fails
        }
      }
    }
    
    const processingTime = Date.now() - startTime;
    
    res.json({
      decisions,
      appliedConfig: activePrompt.name,
      processingTime,
      cacheStats: useCache ? {
        totalSegments: Object.keys(normalizedSegmentMap).length,
        cachedSegments: cachedCount,
        newClassifications: segmentsToClassify.length,
        cacheHitRate: Math.round((cachedCount / Object.keys(normalizedSegmentMap).length) * 100)
      } : undefined
    });
  } catch (error) {
    console.error('Error in optimized classification:', error);
    next(error);
  }
});

// Save manual formatting choices for a document
router.post('/:id/save-manual-formatting', async (req, res, next) => {
  try {
    const documentId = parseInt(req.params.id);
    const { manualChoices, systemPromptId } = req.body;
    
    // Validate document exists
    const document = await prisma.document.findUnique({
      where: { id: documentId }
    });
    
    if (!document) {
      return res.status(404).json({
        error: 'Document not found'
      });
    }
    
    // Validate active CLASSIFICATION prompt
    const activePrompt = await prisma.systemPrompt.findFirst({
      where: { id: systemPromptId, promptType: 'CLASSIFICATION', isActive: true }
    });
    
    if (!activePrompt || !activePrompt.rememberFormattingChoices) {
      return res.status(400).json({
        error: 'Manual formatting choices require an active CLASSIFICATION prompt with cache enabled'
      });
    }
    
    // Validate input
    if (!Array.isArray(manualChoices) || manualChoices.length === 0) {
      return res.status(400).json({
        error: 'Manual choices array is required and must not be empty'
      });
    }
    
    // Validate each choice
    for (const choice of manualChoices) {
      if (!choice.originalText || typeof choice.originalText !== 'string') {
        return res.status(400).json({
          error: 'Each manual choice must have a valid originalText'
        });
      }
      
      if (!['skip', 'include', 'normal'].includes(choice.classificationAction)) {
        return res.status(400).json({
          error: 'Each manual choice must have a valid classificationAction (skip, include, or normal)'
        });
      }
    }
    
    // Save manual choices using FormattingChoiceService
    await formattingChoiceService.saveManualChoices(
      manualChoices,
      systemPromptId,
      documentId
    );
    
    // Return updated cache statistics
    const cacheStats = await formattingChoiceService.getEnhancedCacheStats(systemPromptId);
    
    res.json({
      message: `Saved ${manualChoices.length} manual formatting choices`,
      cacheStats
    });
  } catch (error) {
    next(error);
  }
});

export default router;
