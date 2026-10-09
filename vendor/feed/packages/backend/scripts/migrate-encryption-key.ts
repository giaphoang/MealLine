import { KeyManager } from '../src/services/encryption/key-manager';
import prisma from '../src/db';
import * as dotenv from 'dotenv';

dotenv.config();

async function migrateEncryptionKey() {
  const existingKey = process.env.ENCRYPTION_MASTER_KEY;
  
  if (!existingKey) {
    console.error('No ENCRYPTION_MASTER_KEY found in .env');
    process.exit(1);
  }

  console.log('Migrating encryption key from .env to database...');

  try {
    // Check if key already exists
    const existing = await KeyManager.listKeys('api_encryption');
    
    if (existing.length > 0) {
      console.log('✓ Encryption key already exists in database');
      return;
    }

    // Create key with timestamp-based ID
    const keyId = `master-${Date.now()}`;
    
    await prisma.encryptionKey.create({
      data: {
        keyId,
        keyValue: existingKey,
        purpose: 'api_encryption',
        isActive: true,
        algorithm: 'aes-256-gcm'
      }
    });

    console.log('✓ Successfully migrated encryption key to database');
    console.log(`  Key ID: ${keyId}`);
    console.log('\nNext steps:');
    console.log('1. Verify the key works by testing API encryption');
    console.log('2. Remove ENCRYPTION_MASTER_KEY from .env');
    console.log('3. Update .env.example');
    
  } catch (error) {
    console.error('✗ Migration failed:', error);
    process.exit(1);
  }
}

migrateEncryptionKey()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
