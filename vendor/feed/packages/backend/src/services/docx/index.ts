// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { PrismaClient } from '@prisma/client';
import DocxParser from './parser';
import DocxTranslationService from './translation';
import { storageService } from '../storage';
import DocxTextValidator from './text-validation';
import StyleManager from './StyleManager';
import * as DocxTypes from './types';

// Create and export the DocxParser
const docxParser = new DocxParser();

// Create and export the DocxTranslationService with the shared Prisma client
const prisma = new PrismaClient();
const docxTranslationService = new DocxTranslationService(prisma);

// Initialize services if not already done
(async () => {
  try {
    // Ensure storage is initialized
    await storageService.initialize();
    console.log('DocxTranslationService: Storage service initialized');
  } catch (error) {
    console.error('DocxTranslationService: Failed to initialize storage service', error);
  }
})();

export {
  docxParser,
  docxTranslationService,
  DocxTextValidator,
  StyleManager,
  DocxTypes
};
