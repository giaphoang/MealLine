// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import express from 'express';
import fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { STORAGE_PATH } from '../config/env';
import { SUPPORT_CONTACT_SENTENCE } from '../lib/support';

const router = express.Router();
const baseDir = path.resolve(process.cwd(), STORAGE_PATH);

/**
 * Get a list of all quarantined files
 */
router.get('/', async (req, res, next) => {
  try {
    const quarantinePath = path.join(baseDir, 'quarantine');
    
    // Check if quarantine directory exists
    try {
      await fsPromises.access(quarantinePath, fs.constants.F_OK);
    } catch {
      // Directory doesn't exist, return empty result
      return res.json({
        status: 'success',
        files: [],
        count: 0
      });
    }
    
    // Get all subdirectories
    const quarantineTypes = ['documents', 'translations'];
    const allFiles = [];
    
    for (const type of quarantineTypes) {
      const typePath = path.join(quarantinePath, type);
      
      try {
        await fsPromises.access(typePath, fs.constants.F_OK);
        
        // Get all files in this directory
        const files = await fsPromises.readdir(typePath);
        
        // Map file details
        for (const file of files) {
          if (file.endsWith('.docx')) {
            try {
              const filePath = path.join(typePath, file);
              const stats = await fsPromises.stat(filePath);
              
              allFiles.push({
                id: path.basename(file, '.docx'),
                name: file,
                type,
                size: stats.size,
                createdAt: stats.birthtime,
              });
            } catch (fileError) {
              console.error(`Error getting file stats for ${file}:`, fileError);
            }
          }
        }
      } catch {
        // Type directory doesn't exist, skip
        continue;
      }
    }
    
    // Sort files by creation date, newest first
    allFiles.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    res.json({
      status: 'success',
      files: allFiles,
      count: allFiles.length
    });
  } catch (error) {
    console.error('Error getting quarantined files:', error);
    const friendlyError = new Error('We couldn\'t retrieve the quarantined files. Please refresh the page or try again later.');
    (friendlyError as any).statusCode = 500;
    next(friendlyError);
  }
});

/**
 * Download a quarantined file
 */
router.get('/:type/:id', async (req, res, next) => {
  try {
    const { type, id } = req.params;
    
    // Validate type
    if (type !== 'documents' && type !== 'translations') {
      return res.status(400).json({ error: 'Please select either "documents" or "translations" as the file type.' });
    }
    
    // Validate ID format to prevent path traversal
    if (!id.match(/^[a-zA-Z0-9-]+$/)) {
      return res.status(400).json({ error: 'The file ID contains invalid characters. Please use only letters, numbers, and hyphens.' });
    }
    
    const filePath = path.join(baseDir, 'quarantine', type, `${id}.docx`);
    
    try {
      await fsPromises.access(filePath, fs.constants.F_OK);
    } catch {
      return res.status(404).json({ error: 'The requested file could not be found. It may have been deleted or moved.' });
    }
    
    // Set filename for download
    const filename = `quarantined-${type}-${id}.docx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    
    // Stream the file to the response
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Error downloading quarantined file:', error);
    const friendlyError = new Error(`We encountered a problem downloading this file. Please try again. ${SUPPORT_CONTACT_SENTENCE}`);
    (friendlyError as any).statusCode = 500;
    next(friendlyError);
  }
});

/**
 * Delete all quarantined files
 */
router.delete('/all', async (req, res, next) => {
  try {
    const quarantinePath = path.join(baseDir, 'quarantine');
    
    // Check if quarantine directory exists
    try {
      await fsPromises.access(quarantinePath, fs.constants.F_OK);
    } catch {
      // Directory doesn't exist, nothing to delete
      return res.json({
        status: 'success',
        message: 'No quarantined files to delete',
        count: 0
      });
    }
    
    // Get all subdirectories
    const quarantineTypes = ['documents', 'translations'];
    let totalDeleted = 0;
    
    for (const type of quarantineTypes) {
      const typePath = path.join(quarantinePath, type);
      
      try {
        await fsPromises.access(typePath, fs.constants.F_OK);
        
        // Get all files in this directory
        const files = await fsPromises.readdir(typePath);
        
        // Delete each file
        for (const file of files) {
          if (file.endsWith('.docx')) {
            try {
              const filePath = path.join(typePath, file);
              await fsPromises.unlink(filePath);
              totalDeleted++;
            } catch (fileError) {
              console.error(`Error deleting file ${file}:`, fileError);
            }
          }
        }
      } catch {
        // Type directory doesn't exist, skip
        continue;
      }
    }
    
    res.json({
      status: 'success',
      message: `${totalDeleted} quarantined files deleted successfully`,
      count: totalDeleted
    });
  } catch (error) {
    console.error('Error deleting all quarantined files:', error);
    const friendlyError = new Error(`We couldn't delete all quarantined files. Please try again later. ${SUPPORT_CONTACT_SENTENCE}`);
    (friendlyError as any).statusCode = 500;
    next(friendlyError);
  }
});

/**
 * Delete a quarantined file
 */
router.delete('/:type/:id', async (req, res, next) => {
  try {
    const { type, id } = req.params;
    
    // Validate type
    if (type !== 'documents' && type !== 'translations') {
      return res.status(400).json({ error: 'Invalid file type' });
    }
    
    // Validate ID format to prevent path traversal
    if (!id.match(/^[a-zA-Z0-9-]+$/)) {
      return res.status(400).json({ error: 'Invalid file ID format' });
    }
    
    const filePath = path.join(baseDir, 'quarantine', type, `${id}.docx`);
    
    try {
      await fsPromises.access(filePath, fs.constants.F_OK);
    } catch {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Delete the file
    await fsPromises.unlink(filePath);
    
    res.json({
      status: 'success',
      message: `Quarantined file ${id} deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting quarantined file:', error);
    const friendlyError = new Error(`We couldn't delete this file. Please try again. ${SUPPORT_CONTACT_SENTENCE}`);
    (friendlyError as any).statusCode = 500;
    next(friendlyError);
  }
});

export default router;
