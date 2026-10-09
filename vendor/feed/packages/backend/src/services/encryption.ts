// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import crypto from 'crypto';
import { KeyManager } from './encryption/key-manager';

interface EncryptedField {
  encrypted: string;
  salt: string;
}

/**
 * Encrypts an API key using AES-256-GCM encryption
 * @param apiKey - The API key to encrypt
 * @returns Object containing encrypted data and salt
 */
export const encryptApiKey = async (apiKey: string): Promise<EncryptedField> => {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('API key must be a non-empty string');
  }

  const masterKey = await KeyManager.getActiveKey('api_encryption');
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.scryptSync(masterKey, salt, 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(apiKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  
  return { 
    encrypted: iv.toString('hex') + ':' + encrypted + ':' + tag, 
    salt 
  };
};

/**
 * Decrypts an API key using AES-256-GCM decryption
 * @param encrypted - The encrypted data string (iv:encrypted:tag format)
 * @param salt - The salt used for key derivation
 * @returns The decrypted API key
 */
export const decryptApiKey = async (encrypted: string, salt: string): Promise<string> => {
  if (!encrypted || !salt) {
    throw new Error('Encrypted data and salt are required');
  }

  try {
    const masterKey = await KeyManager.getActiveKey('api_encryption');
    const key = crypto.scryptSync(masterKey, salt, 32);
    const parts = encrypted.split(':');
    
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const [ivHex, encryptedHex, tagHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Validates that an encrypted field contains the expected components
 * @param encryptedField - The encrypted field to validate
 * @returns True if valid, throws error if invalid
 */
export const validateEncryptedField = (encryptedField: EncryptedField): boolean => {
  if (!encryptedField.encrypted || !encryptedField.salt) {
    throw new Error('Encrypted field must contain both encrypted data and salt');
  }

  const parts = encryptedField.encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Encrypted data must be in iv:encrypted:tag format');
  }

  // Validate hex encoding
  const hexPattern = /^[0-9a-fA-F]+$/;
  for (const part of parts) {
    if (!hexPattern.test(part)) {
      throw new Error('Encrypted data components must be valid hex strings');
    }
  }

  if (!hexPattern.test(encryptedField.salt)) {
    throw new Error('Salt must be a valid hex string');
  }

  return true;
};

/**
 * Generates a new master encryption key for use in environment variables
 * This function is for setup purposes only
 * @returns Base64-encoded encryption key
 */
export const generateMasterKey = (): string => {
  return crypto.randomBytes(32).toString('base64');
};
