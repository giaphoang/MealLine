// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import * as fs from 'fs/promises';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { STORAGE_PATH } from '../../config/env';
import { storageService } from './index';

class StorageReconciliationService {
  private prisma: PrismaClient;
  private baseDir: string;
  private isReconciling: boolean = false;

  constructor() {
    this.prisma = new PrismaClient();
    this.baseDir = path.resolve(process.cwd(), STORAGE_PATH);
  }

  /**
   * Reconcile storage with database for a specific operation
   * @param operationType Type of operation (download, delete, etc.)
   * @param entityType Type of entity (document, translation)
   * @param entityId ID of the entity
   * @param error Error that triggered reconciliation
   */
  async reconcileAfterError(
    operationType: 'download' | 'delete' | 'update', 
    entityType: 'document' | 'translation', 
    entityId: number | string, 
    error: Error
  ): Promise<{ reconciled: boolean; actions: string[]; remainingIssues: string[] }> {
    console.log(`🔍 RECONCILIATION: Starting after ${operationType} error on ${entityType} ${entityId}`);
    console.log(`🔍 RECONCILIATION: Error details: ${error.message}`);

    // Check if reconciliation is already in progress
    if (this.isReconciling) {
      console.log(`🔍 RECONCILIATION: Another reconciliation is in progress, skipping`);
      return { 
        reconciled: false, 
        actions: [],
        remainingIssues: [`Another reconciliation is already in progress`]
      };
    }

    this.isReconciling = true;
    const startTime = Date.now();
    const actions: string[] = [];
    const remainingIssues: string[] = [];

    try {
      // Determine scope of reconciliation based on error type
      if (error.message.includes('file not found') || 
          error.message.includes('ENOENT') || 
          error.message.includes('no content')) {
        
        // For file not found errors, check specific entity first
        if (entityType === 'document') {
          await this.reconcileDocument(Number(entityId), actions, remainingIssues);
        } else if (entityType === 'translation') {
          // For translations, we need both document ID and language
          const parts = String(entityId).split('-');
          if (parts.length === 2) {
            const documentId = parseInt(parts[0]);
            const language = parts[1];
            await this.reconcileTranslation(documentId, language, actions, remainingIssues);
          } else {
            remainingIssues.push(`Invalid translation identifier: ${entityId}`);
          }
        }
      } else {
        // For other types of errors, run a targeted date-based reconciliation
        const today = new Date();
        await this.reconcileDateRange(today, today, actions, remainingIssues);
      }

      const duration = Date.now() - startTime;
      console.log(`🔍 RECONCILIATION: Completed in ${duration}ms`);
      console.log(`🔍 RECONCILIATION: Actions taken: ${actions.length}`);
      console.log(`🔍 RECONCILIATION: Remaining issues: ${remainingIssues.length}`);

      return {
        reconciled: remainingIssues.length === 0,
        actions,
        remainingIssues,
      };
    } catch (error) {
      console.error(`🔍 RECONCILIATION: Error during reconciliation:`, error);
      remainingIssues.push(`Reconciliation process error: ${error instanceof Error ? error.message : String(error)}`);
      
      return {
        reconciled: false,
        actions,
        remainingIssues,
      };
    } finally {
      this.isReconciling = false;
    }
  }

  /**
   * Run a full scan of all storage and database records
   * This is more intensive and should be triggered carefully
   */
  async fullReconciliation(): Promise<{ reconciled: boolean; actions: string[]; remainingIssues: string[] }> {
    console.log(`🔍 RECONCILIATION: Starting full reconciliation scan`);
    
    // Check if reconciliation is already in progress
    if (this.isReconciling) {
      console.log(`🔍 RECONCILIATION: Another reconciliation is in progress, skipping`);
      return { 
        reconciled: false, 
        actions: [],
        remainingIssues: [`Another reconciliation is already in progress`] 
      };
    }

    this.isReconciling = true;
    const startTime = Date.now();
    const actions: string[] = [];
    const remainingIssues: string[] = [];

    try {
      // Phase 1: Check all database records for missing files
      console.log(`🔍 RECONCILIATION: Phase 1 - Checking database records for missing files`);
      await this.reconcileDatabaseRecords(actions, remainingIssues);

      // Phase 2: Check for orphaned files in storage
      console.log(`🔍 RECONCILIATION: Phase 2 - Checking for orphaned files`);
      await this.reconcileOrphanedFiles(actions, remainingIssues);

      const duration = Date.now() - startTime;
      console.log(`🔍 RECONCILIATION: Full reconciliation completed in ${duration}ms`);
      console.log(`🔍 RECONCILIATION: Actions taken: ${actions.length}`);
      console.log(`🔍 RECONCILIATION: Remaining issues: ${remainingIssues.length}`);

      return {
        reconciled: remainingIssues.length === 0,
        actions,
        remainingIssues,
      };
    } catch (error) {
      console.error(`🔍 RECONCILIATION: Error during full reconciliation:`, error);
      remainingIssues.push(`Full reconciliation process error: ${error instanceof Error ? error.message : String(error)}`);
      
      return {
        reconciled: false,
        actions,
        remainingIssues,
      };
    } finally {
      this.isReconciling = false;
    }
  }

  /**
   * Reconcile records for a specific date range
   * @param startDate Start date for reconciliation
   * @param endDate End date for reconciliation
   * @param actions Optional array to collect actions taken
   * @param remainingIssues Optional array to collect remaining issues
   * @returns If actions and remainingIssues are provided, returns void. Otherwise returns reconciliation result.
   */
  async reconcileDateRange(
    startDate: Date,
    endDate: Date,
    actions?: string[],
    remainingIssues?: string[]
  ): Promise<void | { reconciled: boolean; actions: string[]; remainingIssues: string[] }> {
    // If arrays are not provided, create new ones and return them at the end
    const localActions: string[] = actions || [];
    const localIssues: string[] = remainingIssues || [];
    const returnResult = !actions || !remainingIssues;
    console.log(`🔍 RECONCILIATION: Checking date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    
    // Format dates for storage path construction
    const formatDate = (date: Date) => ({
      year: date.getFullYear(),
      month: String(date.getMonth() + 1).padStart(2, '0'),
      day: String(date.getDate()).padStart(2, '0')
    });

    const start = formatDate(startDate);
    const end = formatDate(endDate);

    // 1. Check documents within date range
    const documents = await this.prisma.document.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: new Date(endDate.getTime() + 24 * 60 * 60 * 1000) // Include the entire end day
        }
      }
    });

    console.log(`🔍 RECONCILIATION: Found ${documents.length} documents in date range`);
    
    // Check each document
    for (const document of documents) {
      await this.reconcileDocument(document.id, localActions, localIssues);
    }

    // 2. Check translations within date range
    const translations = await this.prisma.translatedDocument.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: new Date(endDate.getTime() + 24 * 60 * 60 * 1000) // Include the entire end day
        }
      }
    });

    console.log(`🔍 RECONCILIATION: Found ${translations.length} translations in date range`);
    
    // Check each translation
    for (const translation of translations) {
      await this.reconcileTranslation(translation.documentId, translation.language, localActions, localIssues);
    }

    // 3. Check storage directories for this date range
    // We only check if there's exactly one day in the range (most common case)
    if (startDate.toDateString() === endDate.toDateString()) {
      const documentsPath = path.join(this.baseDir, 'documents', String(start.year), start.month, start.day);
      const translationsPath = path.join(this.baseDir, 'translations', String(start.year), start.month, start.day);
      
      await this.checkOrphanedFilesInDirectory(documentsPath, 'document', localActions, localIssues);
      await this.checkOrphanedFilesInDirectory(translationsPath, 'translation', localActions, localIssues);
    }
    
    // Return results if arrays were not provided
    if (returnResult) {
      return {
        reconciled: localIssues.length === 0,
        actions: localActions,
        remainingIssues: localIssues
      };
    }
  }

  /**
   * Check for orphaned files in a directory
   */
  private async checkOrphanedFilesInDirectory(
    dirPath: string,
    fileType: 'document' | 'translation',
    actions: string[],
    remainingIssues: string[]
  ): Promise<void> {
    try {
      // Check if directory exists first
      try {
        await fs.access(dirPath, fs.constants.F_OK);
      } catch {
        // Directory doesn't exist, nothing to check
        return;
      }

      // Get all files in directory
      const files = await fs.readdir(dirPath);
      console.log(`🔍 RECONCILIATION: Checking ${files.length} files in ${dirPath}`);

      // Get UUIDs from filenames (assuming format like uuid.docx)
      const uuids = files
        .filter(file => file.endsWith('.docx'))
        .map(file => path.basename(file, '.docx'));

      // For each file, check if it belongs to a database record
      for (const uuid of uuids) {
        const relativePath = path.relative(this.baseDir, path.join(dirPath, `${uuid}.docx`));
        let fileUsed = false;

        if (fileType === 'document') {
          // Check if this file belongs to a document
          const document = await this.prisma.document.findFirst({
            where: {
              OR: [
                { uuid: uuid },
                { storagePath: relativePath }
              ]
            }
          });

          if (document) {
            fileUsed = true;
            // Ensure the storage path is correct
            if (document.storagePath !== relativePath) {
              await this.prisma.document.update({
                where: { id: document.id },
                data: { storagePath: relativePath }
              });
              actions.push(`Updated document ${document.id} with correct storage path`);
            }
          }
        } else {
          // Check if this file belongs to a translation
          const translation = await this.prisma.translatedDocument.findFirst({
            where: { storagePath: relativePath }
          });

          if (translation) {
            fileUsed = true;
          }
        }

        if (!fileUsed) {
          // This is an orphaned file
          const fullPath = path.join(dirPath, `${uuid}.docx`);
          
          // Get orphaned file info for logging
          try {
            const stats = await fs.stat(fullPath);
            console.log(`🔍 RECONCILIATION: Found orphaned ${fileType} file: ${fullPath}, size: ${stats.size}, created: ${stats.birthtime}`);
          } catch (error) {
            console.error(`🔍 RECONCILIATION: Error getting stats for orphaned file ${fullPath}:`, error);
          }
          
          // Move to quarantine directory instead of deleting
          // Make sure we use the plural form consistently (documents/translations) for quarantine
          const quarantineType = fileType === 'document' ? 'documents' : 'translations';
          const quarantinePath = path.join(this.baseDir, 'quarantine', quarantineType);
          await fs.mkdir(quarantinePath, { recursive: true });
          
          try {
            await fs.copyFile(fullPath, path.join(quarantinePath, `${uuid}.docx`));
            actions.push(`Moved orphaned ${fileType} file to quarantine: ${uuid}.docx`);
            
            // Only delete after successful copy
            await fs.unlink(fullPath);
          } catch (error) {
            console.error(`🔍 RECONCILIATION: Error quarantining orphaned file ${fullPath}:`, error);
            remainingIssues.push(`Failed to quarantine orphaned ${fileType} file: ${uuid}.docx - ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
    } catch (error) {
      console.error(`🔍 RECONCILIATION: Error checking directory ${dirPath}:`, error);
      remainingIssues.push(`Directory check error for ${dirPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Reconcile a specific document
   */
  private async reconcileDocument(
    documentId: number,
    actions: string[],
    remainingIssues: string[]
  ): Promise<void> {
    console.log(`🔍 RECONCILIATION: Checking document ${documentId}`);

    // Get document from database
    const document = await this.prisma.document.findUnique({
      where: { id: documentId }
    });

    if (!document) {
      remainingIssues.push(`Document ${documentId} not found in database`);
      return;
    }

    // Skip documents without storage path
    if (!document.storagePath) {
      console.log(`🔍 RECONCILIATION: Document ${documentId} has no storage path, skipping`);
      return;
    }

    // Check if file exists
    const exists = await storageService.verifyIntegrity(document.storagePath);
    
    if (!exists) {
      console.log(`🔍 RECONCILIATION: File for document ${documentId} not found at ${document.storagePath}`);
      
      // File is missing, decide what to do
      // Option 1: Update metadata to reflect the issue (default action)
      await this.prisma.document.update({
        where: { id: documentId },
        data: {
          metadata: {
            ...document.metadata as object,
            integrityIssue: true,
            lastCheckAt: new Date().toISOString(),
            reconciliationAttempted: true
          }
        }
      });
      
      actions.push(`Updated document ${documentId} metadata to reflect missing file`);
      
      // Option 2: If this is a repeated integrity issue, clear the storage path
      // to prevent further attempts to access the file
      const metadata = document.metadata as any || {};
      if (metadata.integrityIssue && metadata.reconciliationAttempted) {
        // This is a second reconciliation attempt, clear the reference
        await this.prisma.document.update({
          where: { id: documentId },
          data: {
            storagePath: null,
            metadata: {
              ...document.metadata as object,
              integrityIssue: true,
              storagePath: document.storagePath, // Save original path in metadata
              fileCleared: true,
              clearedAt: new Date().toISOString()
            }
          }
        });
        
        actions.push(`Cleared missing file reference for document ${documentId}`);
        console.log(`🔍 RECONCILIATION: Cleared storage path for document ${documentId} after repeated integrity issues`);
      } else {
        remainingIssues.push(`Document ${documentId} file is missing at ${document.storagePath}`);
      }
    } else {
      // File exists, check if metadata needs updating
      if (document.metadata && (document.metadata as any).integrityIssue) {
        await this.prisma.document.update({
          where: { id: documentId },
          data: {
            metadata: {
              ...document.metadata as object,
              integrityIssue: false,
              lastCheckAt: new Date().toISOString()
            }
          }
        });
        
        actions.push(`Updated document ${documentId} metadata to clear integrity issue`);
      }
    }

    // Also check related translations
    const translations = await this.prisma.translatedDocument.findMany({
      where: { documentId }
    });

    console.log(`🔍 RECONCILIATION: Checking ${translations.length} translations for document ${documentId}`);
    
    for (const translation of translations) {
      await this.reconcileTranslation(documentId, translation.language, actions, remainingIssues);
    }
  }

  /**
   * Reconcile a specific translation
   */
  private async reconcileTranslation(
    documentId: number,
    language: string,
    actions: string[],
    remainingIssues: string[]
  ): Promise<void> {
    console.log(`🔍 RECONCILIATION: Checking translation for document ${documentId}, language ${language}`);

    // Get translation from database
    const translation = await this.prisma.translatedDocument.findFirst({
      where: {
        documentId,
        language
      }
    });

    if (!translation) {
      remainingIssues.push(`Translation for document ${documentId}, language ${language} not found in database`);
      return;
    }

    // Skip translations without storage path
    if (!translation.storagePath) {
      console.log(`🔍 RECONCILIATION: Translation for document ${documentId}, language ${language} has no storage path, skipping`);
      return;
    }

    // Check if file exists
    const exists = await storageService.verifyIntegrity(translation.storagePath);
    
    if (!exists) {
      console.log(`🔍 RECONCILIATION: File for translation of document ${documentId}, language ${language} not found at ${translation.storagePath}`);
      
      // Update metadata to reflect the issue
      await this.prisma.translatedDocument.update({
        where: { id: translation.id },
        data: {
          metadata: {
            ...translation.metadata as object,
            integrityIssue: true,
            lastCheckAt: new Date().toISOString(),
            reconciliationAttempted: true
          }
        }
      });
      
      actions.push(`Updated translation ${translation.id} metadata to reflect missing file`);
      
      // Check if this is a repeated issue, and if so, clear the reference
      const metadata = translation.metadata as any || {};
      if (metadata.integrityIssue && metadata.reconciliationAttempted) {
        // This is a second reconciliation attempt, clear the reference to prevent future errors
        await this.prisma.translatedDocument.update({
          where: { id: translation.id },
          data: {
            metadata: {
              ...translation.metadata as object,
              originalStoragePath: translation.storagePath,
              fileCleared: true,
              clearedAt: new Date().toISOString()
            }
          }
        });
        
        actions.push(`Cleared missing file reference for translation ${translation.id}`);
        console.log(`🔍 RECONCILIATION: Cleared storage path for translation ${translation.id} after repeated integrity issues`);
      } else {
        remainingIssues.push(`Translation file for document ${documentId}, language ${language} is missing at ${translation.storagePath}`);
      }
    } else {
      // File exists, check if metadata needs updating
      if (translation.metadata && (translation.metadata as any).integrityIssue) {
        await this.prisma.translatedDocument.update({
          where: { id: translation.id },
          data: {
            metadata: {
              ...translation.metadata as object,
              integrityIssue: false,
              lastCheckAt: new Date().toISOString()
            }
          }
        });
        
        actions.push(`Updated translation ${translation.id} metadata to clear integrity issue`);
      }
    }
  }

  /**
   * Check all records in the database for missing files
   */
  private async reconcileDatabaseRecords(
    actions: string[],
    remainingIssues: string[]
  ): Promise<void> {
    // Get all documents
    const allDocuments = await this.prisma.document.findMany();
    
    // Filter out documents without storage paths
    const documents = allDocuments.filter(doc => !!doc.storagePath);

    console.log(`🔍 RECONCILIATION: Checking ${documents.length} document records for missing files`);
    
    // Get all storage paths
    const documentPaths = documents.map(doc => doc.storagePath as string);
    
    // Check integrity of all files
    const { missing } = await storageService.checkIntegrity(documentPaths);
    
    // For each missing file, update document metadata
    for (const doc of documents) {
      if (doc.storagePath && missing.includes(doc.storagePath)) {
        console.log(`🔍 RECONCILIATION: File for document ${doc.id} not found at ${doc.storagePath}`);
        
        await this.prisma.document.update({
          where: { id: doc.id },
          data: {
            metadata: {
              ...doc.metadata as object,
              integrityIssue: true,
              lastCheckAt: new Date().toISOString()
            }
          }
        });
        
        actions.push(`Updated document ${doc.id} metadata to reflect missing file`);
        remainingIssues.push(`Document ${doc.id} file is missing at ${doc.storagePath}`);
      }
    }

    // Now check all translations
    const allTranslations = await this.prisma.translatedDocument.findMany();
    
    // Filter out translations without storage paths
    const translations = allTranslations.filter(t => !!t.storagePath);

    console.log(`🔍 RECONCILIATION: Checking ${translations.length} translation records for missing files`);
    
    // Get all storage paths
    const translationPaths = translations.map(t => t.storagePath as string);
    
    // Check integrity of all files
    const translationResults = await storageService.checkIntegrity(translationPaths);
    
    // For each missing file, update translation metadata
    for (const translation of translations) {
      if (translation.storagePath && translationResults.missing.includes(translation.storagePath)) {
        console.log(`🔍 RECONCILIATION: File for translation ${translation.id} not found at ${translation.storagePath}`);
        
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
        
        actions.push(`Updated translation ${translation.id} metadata to reflect missing file`);
        remainingIssues.push(`Translation ${translation.id} file is missing at ${translation.storagePath}`);
      }
    }
  }

  /**
   * Check for orphaned files in storage
   */
  private async reconcileOrphanedFiles(
    actions: string[],
    remainingIssues: string[]
  ): Promise<void> {
    // Create quarantine directory if it doesn't exist
    const quarantineDir = path.join(this.baseDir, 'quarantine');
    await fs.mkdir(path.join(quarantineDir, 'documents'), { recursive: true });
    await fs.mkdir(path.join(quarantineDir, 'translations'), { recursive: true });
    
    // Check documents directory
    const documentsDir = path.join(this.baseDir, 'documents');
    await this.scanDirectoryForOrphans(documentsDir, 'document', actions, remainingIssues);
    
    // Check translations directory
    const translationsDir = path.join(this.baseDir, 'translations');
    await this.scanDirectoryForOrphans(translationsDir, 'translation', actions, remainingIssues);
  }

  /**
   * Recursively scan a directory for orphaned files
   */
  private async scanDirectoryForOrphans(
    dirPath: string,
    fileType: 'document' | 'translation',
    actions: string[],
    remainingIssues: string[]
  ): Promise<void> {
    try {
      // Check if directory exists
      try {
        await fs.access(dirPath, fs.constants.F_OK);
      } catch {
        // Directory doesn't exist, nothing to scan
        return;
      }

      // Get directory contents
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      // Process all files in this directory
      const files = entries.filter(entry => entry.isFile() && entry.name.endsWith('.docx'));
      
      for (const file of files) {
        const fullPath = path.join(dirPath, file.name);
        const relativePath = path.relative(this.baseDir, fullPath);
        
        // Check if this file belongs to a database record
        let fileUsed = false;
        
        if (fileType === 'document') {
          const document = await this.prisma.document.findFirst({
            where: { storagePath: relativePath }
          });
          
          fileUsed = !!document;
        } else {
          const translation = await this.prisma.translatedDocument.findFirst({
            where: { storagePath: relativePath }
          });
          
          fileUsed = !!translation;
        }
        
        if (!fileUsed) {
          // This is an orphaned file
          console.log(`🔍 RECONCILIATION: Found orphaned ${fileType} file: ${relativePath}`);
          
          // Get orphaned file info for logging
          try {
            const stats = await fs.stat(fullPath);
            console.log(`🔍 RECONCILIATION: Orphaned file details: size: ${stats.size}, created: ${stats.birthtime}`);
          } catch (error) {
            console.error(`🔍 RECONCILIATION: Error getting stats for orphaned file ${fullPath}:`, error);
          }
          
          // Move to quarantine directory
          const quarantineType = fileType === 'document' ? 'documents' : 'translations';
          const quarantinePath = path.join(this.baseDir, 'quarantine', quarantineType, file.name);
          
          try {
            await fs.copyFile(fullPath, quarantinePath);
            actions.push(`Moved orphaned ${fileType} file to quarantine: ${relativePath}`);
            
            // Only delete after successful copy
            await fs.unlink(fullPath);
          } catch (error) {
            console.error(`🔍 RECONCILIATION: Error quarantining orphaned file ${fullPath}:`, error);
            remainingIssues.push(`Failed to quarantine orphaned ${fileType} file: ${relativePath} - ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
      
      // Recursively process subdirectories
      const subdirs = entries.filter(entry => entry.isDirectory());
      
      for (const subdir of subdirs) {
        await this.scanDirectoryForOrphans(
          path.join(dirPath, subdir.name),
          fileType,
          actions,
          remainingIssues
        );
      }
    } catch (error) {
      console.error(`🔍 RECONCILIATION: Error scanning directory ${dirPath}:`, error);
      remainingIssues.push(`Directory scan error for ${dirPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Export singleton instance
export const storageReconciliationService = new StorageReconciliationService();
