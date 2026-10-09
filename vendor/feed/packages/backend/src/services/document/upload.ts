// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import path from 'path';
import { storageService } from '../storage';
import { SUPPORT_CONTACT_SENTENCE } from '../../lib/support';

interface UploadResult {
  id: number;
  name: string;
  fileSize: number;
}

class DocumentUploadService {
  constructor(private prisma: PrismaClient) {}

  async uploadDocument(file: Express.Multer.File, name?: string): Promise<UploadResult> {
    console.log('--- Document Upload Service: Starting Upload ---');
    console.log(`Received file: ${file.originalname}, size: ${file.size} bytes`);
    if (name) {
      console.log(`Custom name provided: ${name}`);
    }

    if (!file) {
      console.error('Upload failed: No file provided.');
      throw new Error('Please select a file to upload');
    }

    // Verify file is a DOCX
    if (file.mimetype !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      throw new Error('Please upload a DOCX file. Other file formats are not supported at this time.');
    }

    // Set a size limit (5MB)
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes
    if (file.size > MAX_FILE_SIZE) {
      throw new Error('Please upload a smaller file. The maximum size allowed is 5MB.');
    }

    // Use the file name as document name if not provided
    const documentName = name || path.basename(file.originalname, '.docx');
    console.log(`Using document name: ${documentName}`);

    try {
      // Generate a UUID for the file
      const uuid = randomUUID();
      console.log(`Generated UUID: ${uuid}`);
      
      // Save the file to storage
      console.log('Saving file to storage...');
      const storageInfo = await storageService.saveFile(file.buffer, uuid);
      console.log(`File saved to: ${storageInfo.storagePath}, size: ${storageInfo.fileSize}`);
      
      // Create the document record
      console.log('Creating document record in database...');
      const document = await this.prisma.document.create({
        data: {
          name: documentName,
          uuid,
          storagePath: storageInfo.storagePath,
          fileSize: storageInfo.fileSize,
          contentType: file.mimetype
        }
      });

      console.log(`Database record created with ID: ${document.id}`);
      console.log('--- Document Upload Service: Upload Complete ---');

      return {
        id: document.id,
        name: document.name,
        fileSize: storageInfo.fileSize
      };
    } catch (error: any) {
      console.error('--- Document Upload Service: Upload Failed ---');
      console.error(`Error during upload for document "${documentName}":`, error);
      if (error.code === 'P2002') {
        throw new Error(`A document named "${documentName}" already exists. Please choose a different name.`);
      }
      
      // Handle other errors with friendly messages
      const errorMsg = error instanceof Error ? error.message : 'An unknown error occurred';
      if (errorMsg.includes('storage') || errorMsg.includes('file system')) {
        throw new Error(`Unable to save your file. Please try again. ${SUPPORT_CONTACT_SENTENCE}`);
      } else if (errorMsg.includes('database') || errorMsg.includes('prisma')) {
        throw new Error(`Unable to process your document. Please try again later. ${SUPPORT_CONTACT_SENTENCE}`);
      }
      
      // For unexpected errors, provide a helpful contact
      throw new Error(`There was a problem uploading your document. Please try again. ${SUPPORT_CONTACT_SENTENCE}`);
     
    }
  }
}

export default DocumentUploadService;
