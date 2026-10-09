// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import crypto from 'crypto';
import prisma from '../../db';

export class KeyManager {
  static async getActiveKey(purpose: string = 'api_encryption'): Promise<string> {
    const key = await prisma.encryptionKey.findFirst({
      where: { purpose, isActive: true },
      orderBy: { createdAt: 'desc' }
    });

    if (!key) {
      const error = new Error('SYSTEM_UNINITIALIZED') as Error & { statusCode?: number; code?: string };
      error.statusCode = 400;
      error.code = 'SYSTEM_UNINITIALIZED';
      throw error;
    }

    this.validateKeyValue(key.keyValue);
    return key.keyValue;
  }

  static async createKey(keyId: string, purpose: string = 'api_encryption'): Promise<void> {
    const keyValue = crypto.randomBytes(32).toString('base64');

    await prisma.encryptionKey.create({
      data: {
        keyId,
        keyValue,
        purpose,
        isActive: true,
        algorithm: 'aes-256-gcm'
      }
    });
  }

  static async initializeKey(
    keyValue: string,
    keyId: string = 'primary',
    purpose: string = 'api_encryption'
  ): Promise<void> {
    const normalizedKey = keyValue.trim();
    this.validateKeyValue(normalizedKey);

    const existingKey = await prisma.encryptionKey.findFirst({
      where: { purpose, isActive: true }
    });

    if (existingKey) {
      const error = new Error('System is already initialized. No action is needed.') as Error & { statusCode?: number };
      error.statusCode = 409;
      throw error;
    }

    await prisma.encryptionKey.upsert({
      where: { keyId },
      create: {
        keyId,
        keyValue: normalizedKey,
        purpose,
        isActive: true,
        algorithm: 'aes-256-gcm'
      },
      update: {
        keyValue: normalizedKey,
        purpose,
        isActive: true,
        updatedAt: new Date()
      }
    });
  }

  static async hasActiveKey(purpose: string = 'api_encryption'): Promise<boolean> {
    const key = await prisma.encryptionKey.findFirst({
      where: { purpose, isActive: true }
    });

    return Boolean(key);
  }

  static async rotateKey(
    oldKeyId: string,
    newKeyId: string,
    purpose: string = 'api_encryption'
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.encryptionKey.updateMany({
        where: { keyId: oldKeyId, purpose },
        data: { isActive: false }
      });

      const keyValue = crypto.randomBytes(32).toString('base64');
      await tx.encryptionKey.create({
        data: {
          keyId: newKeyId,
          keyValue,
          purpose,
          isActive: true,
          algorithm: 'aes-256-gcm'
        }
      });
    });
  }

  static async listKeys(purpose?: string) {
    return prisma.encryptionKey.findMany({
      where: purpose ? { purpose } : undefined,
      orderBy: { createdAt: 'desc' }
    });
  }

  private static validateKeyValue(keyValue: string): void {
    if (!keyValue || typeof keyValue !== 'string') {
      const error = new Error('Encryption key is required to initialize the system.') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    const decoded = Buffer.from(keyValue, 'base64');
    if (decoded.length !== 32) {
      const error = new Error('Encryption key must be a base64-encoded 32-byte value.') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }
  }
}
