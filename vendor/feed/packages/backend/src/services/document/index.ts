// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Prisma, PrismaClient, Document } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { storageService } from '../storage';
import { storageReconciliationService } from '../storage/reconciliation';
import { documentIntegrityStateChange } from './integrity-state';

interface CreateDocumentInput {
  name: string;
  content?: Buffer;
}

interface UpdateDocumentInput {
  name?: string;
  content?: Buffer;
}

interface BulkDeleteResult {
  success: number;
  failed: number;
  errors: string[];
}

class DocumentService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    // Initialize storage service
    await storageService.initialize();
    console.log('Document service initialized');
  }

  /**
   * Gets all documents
   */
  async getAll(): Promise<Document[]> {
    const documents = await this.prisma.document.findMany({
      orderBy: { updatedAt: 'desc' }
    });

    // Check integrity of documents while returning them
    this.checkDocumentsIntegrity(documents).catch(err => {
      console.error('Error checking document integrity:', err);
    });

    return documents;
  }

  /**
   * Gets a document by ID
   */
  async getById(id: number): Promise<Document | null> {
    const document = await this.prisma.document.findUnique({
      where: { id }
    });

    if (document && document.storagePath) {
      // Verify integrity of this document
      this.checkDocumentIntegrity(document).catch(err => {
        console.error(`Error checking integrity for document ${id}:`, err);
      });
    }

    return document;
  }

  /**
   * Gets the file content of a document
   */
  async getDocumentContent(id: number): Promise<Buffer> {
    const document = await this.prisma.document.findUnique({
      where: { id }
    });

    if (!document) {
      throw new Error(`Document with ID ${id} not found`);
    }

    if (!document.storagePath) {
      throw new Error(`Document with ID ${id} has no content`);
    }

    console.log(`Download request for document ${id}, filename ${document.name}`);
    
    // Verify integrity before fetching
    const exists = await storageService.verifyIntegrity(document.storagePath);
    if (!exists) {
      // Update metadata to reflect integrity issue
      await this.prisma.document.update({
        where: { id },
        data: {
          metadata: {
            ...document.metadata as object,
            integrityIssue: true,
            lastCheckAt: new Date().toISOString()
          }
        }
      });
      
      // Attempt reconciliation when a file is missing
      const error = new Error(`Document file not found at ${document.storagePath}`);
      console.error(`Error retrieving document file: ${error.message}`);
      
      try {
        console.log(`Triggering storage reconciliation for missing document file`);
        await storageReconciliationService.reconcileAfterError(
          'download',
          'document',
          id,
          error
        );
      } catch (reconciliationError) {
        console.error(`Reconciliation error:`, reconciliationError);
      }
      
      throw error;
    }

    return storageService.getFile(document.storagePath);
  }

  /**
   * Creates a new document
   */
  async create(data: CreateDocumentInput): Promise<Document> {
    try {
      const uuid = randomUUID();
      let storagePath: string | null = null;
      let fileSize: number | null = null;

      // If content is provided, store it
      if (data.content) {
        const storageInfo = await storageService.saveFile(data.content, uuid);
        storagePath = storageInfo.storagePath;
        fileSize = storageInfo.fileSize;
      }

      // Create document record in database
      return await this.prisma.document.create({
        data: {
          name: data.name,
          uuid,
          storagePath,
          fileSize,
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new Error(`Document with name "${data.name}" already exists`);
      }
      throw error;
    }
  }

  /**
   * Updates a document
   */
  async update(id: number, data: UpdateDocumentInput): Promise<Document> {
    try {
      // Get existing document first
      const existingDoc = await this.prisma.document.findUnique({
        where: { id }
      });

      if (!existingDoc) {
        throw new Error(`Document with ID ${id} not found`);
      }

      let storagePath = existingDoc.storagePath;
      let fileSize = existingDoc.fileSize;

      // If new content is provided, update the file
      if (data.content) {
        // Delete old file if it exists
        if (existingDoc.storagePath) {
          try {
            await storageService.deleteFile(existingDoc.storagePath);
          } catch (err) {
            console.error(`Error deleting old file for document ${id}:`, err);
            // Continue even if deletion fails
          }
        }

        // Store new file
        const storageInfo = await storageService.saveFile(
          data.content, 
          existingDoc.uuid
        );
        storagePath = storageInfo.storagePath;
        fileSize = storageInfo.fileSize;
      }

      // Update document record
      return await this.prisma.document.update({
        where: { id },
        data: {
          name: data.name ?? existingDoc.name,
          storagePath,
          fileSize,
          updatedAt: new Date()
        }
      });
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new Error(`Document with ID ${id} not found`);
      }
      if (error.code === 'P2002') {
        throw new Error(`Document with name "${data.name}" already exists`);
      }
      throw error;
    }
  }

  /**
   * Deletes a document and its file
   * @param id The document ID to delete
   * @param options.preserveTranslations Whether to preserve cached translations (default: false)
   */
  async delete(id: number, options: { preserveTranslations?: boolean } = {}): Promise<void> {
    const { preserveTranslations = false } = options;
    try {
      // Use a transaction to ensure atomicity
      await this.prisma.$transaction(async (tx) => {
        // First check if the document exists
        const document = await tx.document.findUnique({
          where: { id }
        });
        
        if (!document) {
          throw new Error(`Document with ID ${id} not found`);
        }
        
        // Get all related translations to delete their files too
        const translations = await tx.translatedDocument.findMany({
          where: { documentId: id }
        });
        
        // Delete translation files
        for (const translation of translations) {
          if (translation.storagePath) {
            try {
              await storageService.deleteFile(translation.storagePath);
            } catch (err) {
              console.error(`Failed to delete translation file ${translation.storagePath}:`, err);
              // Continue even if file deletion fails
            }
          }
        }
        
        // Delete translation records
        const deleteResult = await tx.translatedDocument.deleteMany({
          where: { documentId: id }
        });
        
        console.log(`Deleted ${deleteResult.count} TranslatedDocuments for document ID ${id}`);
        
        // Delete document file if it exists
        if (document.storagePath) {
          try {
            await storageService.deleteFile(document.storagePath);
          } catch (err) {
            console.error(`Failed to delete document file ${document.storagePath}:`, err);
            // Continue even if file deletion fails
          }
        }
        
        // Delete cached translations if preserveTranslations is false
        if (!preserveTranslations) {
          const cachedTranslationsCount = await tx.translation.count({
            where: { documentId: id }
          });
          
          // Delete cached translations instead of just disassociating them
          await tx.translation.deleteMany({
            where: { documentId: id }
          });
          
          console.log(`Deleted ${cachedTranslationsCount} cached translations from document ID ${id}`);
        } else {
          console.log(`Preserving cached translations for document ID ${id}`);
        }
        
        // Finally delete the document record
        await tx.document.delete({
          where: { id }
        });
        
        console.log(`Successfully deleted document with ID ${id} and its associated translations${preserveTranslations ? ' (preserved cached translations)' : ''}`);
      });
    } catch (error: any) {
      console.error(`Error deleting document with ID ${id}:`, error);
      
      // Trigger reconciliation on delete errors
      try {
        console.log(`Triggering storage reconciliation after delete error`);
        await storageReconciliationService.reconcileAfterError(
          'delete',
          'document',
          id,
          error
        );
      } catch (reconciliationError) {
        console.error(`Reconciliation error:`, reconciliationError);
      }
      
      if (error.code === 'P2025' || (error.message && error.message.includes('not found'))) {
        throw new Error(`Document with ID ${id} not found`);
      }
      throw error;
    }
  }

  /**
   * Bulk deletes documents
   * @param ids The document IDs to delete
   * @param options.preserveTranslations Whether to preserve cached translations (default: false)
   */
  async bulkDelete(ids: number[], options: { preserveTranslations?: boolean } = {}): Promise<BulkDeleteResult> {
    const { preserveTranslations = false } = options;
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    try {
      // Process all deletions in a single transaction
      await this.prisma.$transaction(async (tx) => {
        for (const id of ids) {
          try {
            // First check if the document exists
            const document = await tx.document.findUnique({
              where: { id }
            });
            
            if (!document) {
              failed++;
              errors.push(`Document with ID ${id} not found`);
              console.log(`Document with ID ${id} not found - skipping deletion`);
              continue;
            }
            
            // Get all related translations
            const translations = await tx.translatedDocument.findMany({
              where: { documentId: id }
            });
            
            // Delete translation files
            for (const translation of translations) {
              if (translation.storagePath) {
                try {
                  await storageService.deleteFile(translation.storagePath);
                } catch (err) {
                  console.error(`Failed to delete translation file ${translation.storagePath}:`, err);
                  // Continue even if file deletion fails
                }
              }
            }
            
            // Delete translation records
            const deleteResult = await tx.translatedDocument.deleteMany({
              where: { documentId: id }
            });
            
            console.log(`Deleted ${deleteResult.count} TranslatedDocuments for document ID ${id}`);
            
            // Delete document file if it exists
            if (document.storagePath) {
              try {
                await storageService.deleteFile(document.storagePath);
              } catch (err) {
                console.error(`Failed to delete document file ${document.storagePath}:`, err);
                // Continue even if file deletion fails
              }
            }
            
            // Delete cached translations if preserveTranslations is false
            if (!preserveTranslations) {
              const cachedTranslationsCount = await tx.translation.count({
                where: { documentId: id }
              });
              
              // Delete cached translations instead of just disassociating them
              await tx.translation.deleteMany({
                where: { documentId: id }
              });
              
              console.log(`Deleted ${cachedTranslationsCount} cached translations from document ID ${id}`);
            } else {
              console.log(`Preserving cached translations for document ID ${id}`);
            }
            
            // Delete document record
            await tx.document.delete({
              where: { id }
            });
            
            console.log(`Successfully deleted document with ID ${id} and its associated translations${preserveTranslations ? ' (preserved cached translations)' : ''}`);
            success++;
          } catch (error: any) {
            console.error(`Error deleting document with ID ${id} within transaction:`, error);
            failed++;
            const errorMessage = error.code === 'P2025' 
              ? `Document with ID ${id} not found` 
              : `Failed to delete document ID ${id}: ${error.message}`;
            errors.push(errorMessage);
          }
        }
      });
    } catch (transactionError: any) {
      // Handle transaction-level errors (e.g., connection issues)
      console.error('Transaction error during bulk delete:', transactionError);
      
      // Count any documents not yet processed as failed
      const pendingCount = ids.length - (success + failed);
      if (pendingCount > 0) {
        failed += pendingCount;
        errors.push(`Transaction failed: ${transactionError.message}`);
      }
    }

    return { success, failed, errors };
  }
  
  /**
   * Checks integrity of a single document
   */
  private async checkDocumentIntegrity(document: Document): Promise<void> {
    if (!document.storagePath) return;
    
    const exists = await storageService.verifyIntegrity(document.storagePath);
    await this.persistDocumentIntegrityTransition(document, exists);
  }
  
  /**
   * Checks integrity of multiple documents in a non-blocking way
   */
  private async checkDocumentsIntegrity(documents: Document[]): Promise<void> {
    const documentsWithFiles = documents.filter(doc => doc.storagePath);
    if (documentsWithFiles.length === 0) return;
    
    // Get all storage paths
    const paths = documentsWithFiles.map(doc => doc.storagePath as string);
    
    // Check integrity of all files
    const { missing } = await storageService.checkIntegrity(paths);
    
    const missingPaths = new Set(missing);

    // Persist only state transitions. Repeated list reads should not rewrite
    // the same metadata or repeat an already-reported missing-file message.
    for (const doc of documentsWithFiles) {
      if (!doc.storagePath) continue;
      await this.persistDocumentIntegrityTransition(doc, !missingPaths.has(doc.storagePath));
    }
  }

  private async persistDocumentIntegrityTransition(
    document: Document,
    fileExists: boolean,
  ): Promise<void> {
    const stateChange = documentIntegrityStateChange(document.metadata, fileExists);
    if (!stateChange) return;

    if (stateChange.transition === 'missing') {
      console.error(`Integrity check: File for document ${document.id} not found at ${document.storagePath}`);
    } else {
      console.info(`Integrity check: File for document ${document.id} is available again at ${document.storagePath}`);
    }

    await this.prisma.document.update({
      where: { id: document.id },
      data: { metadata: stateChange.metadata as Prisma.InputJsonObject },
    });
  }
  
  /**
   * Deletes a specific translation for a document
   */
  async deleteTranslation(documentId: number, language: string): Promise<void> {
    try {
      // First find if the translation exists
      const translation = await this.prisma.translatedDocument.findFirst({
        where: { 
          documentId: documentId,
          language: language 
        }
      });
      
      if (!translation) {
        throw new Error(`Translation for document ID ${documentId} with language ${language} not found`);
      }
      
      // Delete the file if it exists
      if (translation.storagePath) {
        try {
          await storageService.deleteFile(translation.storagePath);
        } catch (err) {
          console.error(`Failed to delete translation file ${translation.storagePath}:`, err);
          // Continue even if file deletion fails
        }
      }
      
      // Delete the translation record
      await this.prisma.translatedDocument.delete({
        where: { id: translation.id }
      });
      
      console.log(`Successfully deleted translation (ID ${translation.id}) for document ${documentId} in language ${language}`);
    } catch (error: any) {
      console.error(`Error deleting translation for document ${documentId}, language ${language}:`, error);
      
      // Trigger reconciliation on translation delete errors
      try {
        console.log(`Triggering storage reconciliation after translation delete error`);
        await storageReconciliationService.reconcileAfterError(
          'delete',
          'translation',
          `${documentId}-${language}`,
          error
        );
      } catch (reconciliationError) {
        console.error(`Reconciliation error:`, reconciliationError);
      }
      
      throw error;
    }
  }
}

export default DocumentService;
