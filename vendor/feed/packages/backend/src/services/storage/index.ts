// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { STORAGE_PATH } from '../../config/env';

export interface StorageInfo {
  storagePath: string;
  uuid: string;
  fileSize: number;
}

export class FileStorageService {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  /**
   * Initialize storage directories
   */
  async initialize(): Promise<void> {
    try {
      // Ensure base directories exist
      await fs.mkdir(path.join(this.baseDir, 'documents'), { recursive: true });
      await fs.mkdir(path.join(this.baseDir, 'translations'), { recursive: true });
      await fs.mkdir(path.join(this.baseDir, 'shopping-list-pdfs'), { recursive: true });
      console.log('Storage directories initialized');
    } catch (error) {
      console.error('Error initializing storage directories:', error);
      throw error;
    }
  }

  /**
   * Gets a path for storing a document based on current date
   * @returns A relative storage path like documents/2025/03/01/
   */
  private getDateBasedPath(type: 'documents' | 'translations' | 'shopping-list-pdfs'): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    
    return path.join(type, String(year), month, day);
  }

  /**
   * Saves a file to storage
   * @param buffer The file buffer
   * @param uuid The UUID for the file
   * @param type The type of document (original, translation, or PDF)
   * @param extension The file extension (defaults to 'docx')
   * @returns Storage info including path, UUID, and size
   */
  async saveFile(
    buffer: Buffer, 
    uuid: string = randomUUID(),
    type: 'documents' | 'translations' | 'shopping-list-pdfs' = 'documents',
    extension: string = 'docx'
  ): Promise<StorageInfo> {
    try {
      // Create relative path based on date: documents/YYYY/MM/DD/
      const relativePath = this.getDateBasedPath(type);
      const dirPath = path.join(this.baseDir, relativePath);
      
      // Ensure directory exists
      await fs.mkdir(dirPath, { recursive: true });
      
      // Create filename with UUID and extension
      const filename = `${uuid}.${extension}`;
      const fullPath = path.join(dirPath, filename);
      
      // Write file
      await fs.writeFile(fullPath, buffer);
      
      // Return storage info
      return {
        storagePath: path.join(relativePath, filename),
        uuid,
        fileSize: buffer.length
      };
    } catch (error) {
      console.error('Error saving file:', error);
      throw error;
    }
  }

  /**
   * Gets a file from storage
   * @param storagePath The path where the file is stored
   * @returns The file buffer
   */
  async getFile(storagePath: string): Promise<Buffer> {
    try {
      const fullPath = path.join(this.baseDir, storagePath);
      return fs.readFile(fullPath);
    } catch (error) {
      console.error(`Error getting file from ${storagePath}:`, error);
      throw error;
    }
  }

  /**
   * Verifies that a file exists at the given path
   * @param storagePath The path to verify
   * @returns True if the file exists, false otherwise
   */
  async verifyIntegrity(storagePath: string): Promise<boolean> {
    try {
      const fullPath = path.join(this.baseDir, storagePath);
      await fs.access(fullPath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Deletes a file from storage
   * @param storagePath The path to the file
   */
  async deleteFile(storagePath: string): Promise<void> {
    try {
      const fullPath = path.join(this.baseDir, storagePath);
      await fs.unlink(fullPath);
    } catch (error) {
      console.error(`Error deleting file ${storagePath}:`, error);
      throw error;
    }
  }

  /**
   * Performs an integrity check on all files
   * @param paths An array of storage paths to check
   * @returns An object indicating which files exist and which don't
   */
  async checkIntegrity(paths: string[]): Promise<{ 
    valid: string[]; 
    missing: string[];
  }> {
    const valid: string[] = [];
    const missing: string[] = [];
    
    for (const path of paths) {
      const exists = await this.verifyIntegrity(path);
      if (exists) {
        valid.push(path);
      } else {
        missing.push(path);
      }
    }
    
    return { valid, missing };
  }
}

// Create and export singleton instance with the base directory from environment
export const storageService = new FileStorageService(
  path.resolve(process.cwd(), STORAGE_PATH)
);
