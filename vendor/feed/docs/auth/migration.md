# Environment Configuration Migration Plan

**Document Version:** 1.0  
**Date:** December 9, 2025  
**Status:** Migration Plan

---

## Overview

This document outlines the migration plan to modernize the FEED app's configuration management by:

1. **Removing rate limiting** from .env (now managed in AI Configuration database)
2. **Migrating encryption keys** from .env to database (following ZEV app pattern)
3. **Updating authentication settings** for Magic Link + OTP system

---

## Current State Analysis

### Current .env Issues

```bash
# ❌ PROBLEM 1: Rate limiting duplicated in .env and database
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# ❌ PROBLEM 2: Encryption key stored in plain text file
ENCRYPTION_MASTER_KEY=

# ❌ PROBLEM 3: Outdated authentication config
AUTH_USERNAME=
AUTH_PASSWORD=
FORCE_AUTH=true
```

### ZEV App Pattern (Best Practice)

ZEV stores encryption keys in database with this model:

```prisma
model EncryptionKey {
  id        String   @id @default(cuid())
  keyId     String   @unique
  keyValue  String
  algorithm String   @default("aes-256-gcm")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**Benefits:**
- Keys backed up with database
- Supports key rotation
- Better access control
- Can have multiple keys for different purposes
- No secrets in version control

---

## Migration Plan

### Phase 1: Rate Limiting Cleanup (30 minutes)

#### Step 1.1: Verify AI Configuration Storage

Rate limiting is now stored per AI configuration in the database:

```typescript
// Already in AIConfiguration model:
tokensPerMinute   Int?
requestsPerMinute Int?
requestsPerDay    Int?
```

Verify this is working:

```bash
cd packages/backend
npx prisma studio
# Check AIConfiguration table has these fields populated
```

#### Step 1.2: Remove Legacy Rate Limiting Code

**File: `packages/backend/src/middleware/rate-limiter.ts`**

Check if this file uses `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX_REQUESTS`:

```bash
grep -r "RATE_LIMIT_WINDOW_MS" packages/backend/src/
grep -r "RATE_LIMIT_MAX_REQUESTS" packages/backend/src/
```

If found, update to use AI configuration values instead.

#### Step 1.3: Update .env

Remove these lines:
```bash
# REMOVE THESE:
# RATE_LIMIT_WINDOW_MS=60000
# RATE_LIMIT_MAX_REQUESTS=100
```

#### Step 1.4: Update .env.example

```bash
# Remove from .env.example too
cd packages/backend
# Edit .env.example to remove rate limiting vars
```

---

### Phase 2: Encryption Key Migration (2-3 hours)

#### Step 2.1: Add EncryptionKey Model to Schema

**File: `packages/backend/prisma/schema.prisma`**

Add this model (similar to ZEV):

```prisma
model EncryptionKey {
  id        String   @id @default(cuid())
  keyId     String   @unique
  algorithm String   @default("aes-256-gcm")
  keyValue  String   // Base64-encoded key
  purpose   String   @default("api_encryption") // 'api_encryption', 'document_encryption', etc.
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([keyId])
  @@index([purpose, isActive])
}
```

#### Step 2.2: Create Migration

```bash
cd packages/backend
npx prisma migrate dev --name add_encryption_key_table
npx prisma generate
```

#### Step 2.3: Create Key Management Service

**File: `packages/backend/src/services/encryption/key-manager.ts`**

```typescript
import { prisma } from '@/db';
import * as crypto from 'crypto';

export class KeyManager {
  // Get active encryption key
  static async getActiveKey(purpose: string = 'api_encryption'): Promise<string> {
    const key = await prisma.encryptionKey.findFirst({
      where: { purpose, isActive: true },
      orderBy: { createdAt: 'desc' }
    });

    if (!key) {
      throw new Error(`No active encryption key found for purpose: ${purpose}`);
    }

    return key.keyValue;
  }

  // Create new encryption key
  static async createKey(
    keyId: string, 
    purpose: string = 'api_encryption'
  ): Promise<void> {
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

  // Rotate encryption key (creates new, marks old as inactive)
  static async rotateKey(
    oldKeyId: string,
    newKeyId: string,
    purpose: string = 'api_encryption'
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // Deactivate old key
      await tx.encryptionKey.updateMany({
        where: { keyId: oldKeyId, purpose },
        data: { isActive: false }
      });

      // Create new key
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

  // List all keys for a purpose
  static async listKeys(purpose?: string) {
    return await prisma.encryptionKey.findMany({
      where: purpose ? { purpose } : undefined,
      orderBy: { createdAt: 'desc' }
    });
  }
}
```

#### Step 2.4: Update Encryption Service

**File: `packages/backend/src/services/encryption.ts`**

Replace `process.env.ENCRYPTION_MASTER_KEY` with database lookup:

```typescript
import { KeyManager } from './encryption/key-manager';

export const encryptApiKey = async (apiKey: string): Promise<EncryptedField> => {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('API key must be a non-empty string');
  }

  // Get key from database instead of env
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

export const decryptApiKey = async (encrypted: string, salt: string): Promise<string> => {
  if (!encrypted || !salt) {
    throw new Error('Encrypted data and salt are required');
  }

  try {
    // Get key from database instead of env
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
```

**Note:** All encryption functions now need to be `async` since they query the database.

#### Step 2.5: Update All Encryption Usage

Search for all uses of `encryptApiKey` and `decryptApiKey`:

```bash
cd packages/backend
grep -r "encryptApiKey\|decryptApiKey" src/
```

Update all call sites to use `await`:

```typescript
// BEFORE:
const encrypted = encryptApiKey(apiKey);

// AFTER:
const encrypted = await encryptApiKey(apiKey);
```

#### Step 2.6: Create Migration Script

**File: `packages/backend/scripts/migrate-encryption-key.ts`**

```typescript
import { KeyManager } from '../src/services/encryption/key-manager';
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
```

#### Step 2.7: Run Migration

```bash
cd packages/backend
npm run ts-node scripts/migrate-encryption-key.ts
```

#### Step 2.8: Test Encryption

Create a test script to verify encryption still works:

```bash
cd packages/backend
npm run ts-node scripts/test-encryption.ts
```

**File: `packages/backend/scripts/test-encryption.ts`**

```typescript
import { encryptApiKey, decryptApiKey } from '../src/services/encryption';

async function testEncryption() {
  const testApiKey = 'sk-test-1234567890abcdef';
  
  console.log('Testing encryption with database-stored key...');
  console.log('Original:', testApiKey);
  
  const encrypted = await encryptApiKey(testApiKey);
  console.log('Encrypted:', encrypted);
  
  const decrypted = await decryptApiKey(encrypted.encrypted, encrypted.salt);
  console.log('Decrypted:', decrypted);
  
  if (decrypted === testApiKey) {
    console.log('✓ Encryption test PASSED');
  } else {
    console.error('✗ Encryption test FAILED');
    process.exit(1);
  }
}

testEncryption()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Test error:', error);
    process.exit(1);
  });
```

#### Step 2.9: Remove Key from .env

Once verified working:

```bash
# Remove from .env:
# ENCRYPTION_MASTER_KEY=<your-base64-32-byte-key>
```

#### Step 2.10: Update Documentation

Add to README:

```markdown
## Encryption Key Management

The application uses database-stored encryption keys for API key encryption. Keys are managed through the KeyManager service.

### Initial Setup

On first deployment, create an encryption key:

\`\`\`bash
cd packages/backend
npx ts-node scripts/migrate-encryption-key.ts
\`\`\`

### Key Rotation

To rotate encryption keys:

\`\`\`typescript
import { KeyManager } from '@/services/encryption/key-manager';

await KeyManager.rotateKey(
  'old-key-id',
  'new-key-id',
  'api_encryption'
);
\`\`\`
```

---

### Phase 3: Authentication Settings Update (30 minutes)

#### Step 3.1: Remove Old Auth Settings

From .env, remove:
```bash
# AUTH_USERNAME=
# AUTH_PASSWORD=
# FORCE_AUTH=true
```

#### Step 3.2: Add New Auth Settings

Add to .env:

```bash
# ===================================
# AUTHENTICATION (Magic Link + OTP)
# ===================================

# JWT Configuration
JWT_SECRET="[GENERATE WITH: openssl rand -base64 64]"
JWT_EXPIRES_IN="7d"

# Email Service (Resend)
RESEND_API_KEY="[Get from resend.com]"
EMAIL_FROM="login@williamtemple.app"

# Application URLs
APP_URL="http://localhost:5173"  # Frontend URL
COOKIE_DOMAIN="localhost"        # Use ".williamtemple.app" in production

# Development Settings
NODE_ENV=development
FORCE_AUTH=false  # Allow bypassing auth in development
```

#### Step 3.3: Generate JWT Secret

```bash
openssl rand -base64 64
```

Copy output to `JWT_SECRET` in .env.

#### Step 3.4: Update .env.example

**File: `packages/backend/.env.example`**

```bash
# ===================================
# DATABASE
# ===================================
DATABASE_URL="file:../dev.db"

# ===================================
# SERVER
# ===================================
NODE_ENV=development
PORT=3001

# ===================================
# AUTHENTICATION (Magic Link + OTP)
# ===================================

# JWT Configuration (REQUIRED)
# Generate with: openssl rand -base64 64
JWT_SECRET="your-secret-key-here-minimum-64-characters"
JWT_EXPIRES_IN="7d"

# Email Service - Resend (REQUIRED for production)
RESEND_API_KEY="re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
EMAIL_FROM="login@williamtemple.app"

# Application URLs
APP_URL="http://localhost:5173"
COOKIE_DOMAIN="localhost"

# Development Settings
FORCE_AUTH=false  # Set to true to require auth in development

# ===================================
# STORAGE
# ===================================
STORAGE_PATH="./storage"

# ===================================
# NOTES
# ===================================

# Rate Limiting:
#   Now managed in AI Configuration (database)
#   Configure via AI Configuration UI

# Encryption Keys:
#   Now stored in database (EncryptionKey table)
#   Use scripts/migrate-encryption-key.ts for initial setup
```

#### Step 3.5: Create Setup Script

**File: `packages/backend/scripts/setup-auth.ts`**

```typescript
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

function setupAuth() {
  console.log('=== FEED Authentication Setup ===\n');

  // Generate JWT secret
  const jwtSecret = crypto.randomBytes(48).toString('base64');
  console.log('Generated JWT_SECRET:');
  console.log(jwtSecret);
  console.log('');

  // Check if .env exists
  const envPath = path.join(__dirname, '..', '.env');
  const envExists = fs.existsSync(envPath);

  if (!envExists) {
    console.log('No .env file found. Copy .env.example to .env first.');
    return;
  }

  // Read current .env
  let envContent = fs.readFileSync(envPath, 'utf8');

  // Check for old auth settings
  if (envContent.includes('AUTH_USERNAME') || envContent.includes('AUTH_PASSWORD')) {
    console.log('⚠️  Old authentication settings detected in .env');
    console.log('Please manually update your .env file:');
    console.log('');
    console.log('REMOVE:');
    console.log('  AUTH_USERNAME=');
    console.log('  AUTH_PASSWORD=');
    console.log('');
    console.log('ADD:');
    console.log(`  JWT_SECRET="${jwtSecret}"`);
    console.log('  JWT_EXPIRES_IN="7d"');
    console.log('  RESEND_API_KEY="[from resend.com]"');
    console.log('  EMAIL_FROM="login@williamtemple.app"');
    console.log('');
  }

  console.log('Setup complete!');
  console.log('');
  console.log('Next steps:');
  console.log('1. Update .env with generated JWT_SECRET');
  console.log('2. Sign up at resend.com and add RESEND_API_KEY');
  console.log('3. Verify domain in Resend dashboard');
  console.log('4. Run: npm run migrate-encryption-key');
}

setupAuth();
```

Run it:

```bash
cd packages/backend
npm run ts-node scripts/setup-auth.ts
```

---

## Testing Checklist

### Phase 1: Rate Limiting
- [ ] AI Configuration values being used
- [ ] No references to RATE_LIMIT_* env vars
- [ ] Backend starts without errors
- [ ] Rate limiting still works

### Phase 2: Encryption
- [ ] Migration script runs successfully
- [ ] Test encryption script passes
- [ ] Can encrypt/decrypt API keys
- [ ] Existing encrypted data still decrypts
- [ ] No ENCRYPTION_MASTER_KEY in .env
- [ ] Backend starts without errors

### Phase 3: Authentication
- [ ] JWT_SECRET generated and added
- [ ] RESEND_API_KEY configured
- [ ] Old AUTH_* vars removed
- [ ] Backend starts without errors
- [ ] Ready for Stage 1 of auth implementation

---

## Status

- ✅ All phases completed (rate limits env removal, encryption key migration, auth env update)
- ✅ Encryption key stored in database; ENCRYPTION_MASTER_KEY removed from `.env`
- ✅ JWT/Resend auth settings applied
- ✅ Backend starts cleanly; docs updated

## Timeline (Completed)

| Phase | Duration | Status |
|-------|----------|--------|
| Phase 1: Rate Limiting | 30 min | ✅ Complete |
| Phase 2: Encryption | 2-3 hours | ✅ Complete |
| Phase 3: Auth Settings | 30 min | ✅ Complete |

**Total: 3-4 hours**

---

**Last Updated:** December 10, 2025
