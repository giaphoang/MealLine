# Production-Ready Authentication Plan for FEED App

**Document Version:** 1.1  
**Date:** December 10, 2025  
**Author:** System Architecture Team  
**Status:** Stage 4 (JWT + OTP) Implemented in Dev; Production Hardening Pending

---

## Executive Summary

This document outlines a comprehensive plan to migrate the FEED application from its current HTTP Basic Authentication to a production-ready authentication system using industry best practices as of December 2025. The implementation will leverage Resend for email delivery, support both Magic Link and OTP authentication, and maintain the existing Express + React architecture.

### Current State vs. Target State

| Aspect | Current (v0.14.9) | Target (v0.14.9) |
|--------|---------------------|-----------------|
| **Method** | HTTP Basic Auth | Magic Link + OTP |
| **User Database** | None | Prisma/SQLite |
| **Session** | sessionStorage | JWT (httpOnly cookies) |
| **Email Service** | None | Resend API |
| **Security** | Basic (Base64) | Industry standard |
| **Rate Limiting** | None | Comprehensive |
| **Production Ready** | No | Yes |

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Authentication Methods](#authentication-methods)
3. [Database Schema](#database-schema)
4. [Backend Implementation](#backend-implementation)
5. [Frontend Implementation](#frontend-implementation)
6. [Security Considerations](#security-considerations)
7. [Migration Strategy](#migration-strategy)
8. [Testing Strategy](#testing-strategy)
9. [Deployment Checklist](#deployment-checklist)
10. [Rollback Plan](#rollback-plan)

---

## 1. Architecture Overview

### 1.1 Technology Stack Adaptation

The WTH FEED app uses **Express + React** (not Next.js), requiring adaptation of patterns from Lotto/Zev apps which use NextAuth.js:

```
Current Stack:
- Backend: Express.js + Prisma + SQLite
- Frontend: React + Vite + TypeScript
- Architecture: Monorepo (packages/frontend, packages/backend)

Target Authentication:
- Core Library: Custom Express implementation (inspired by @auth/core patterns)
- Email Provider: Resend API
- Session Management: JWT with httpOnly cookies
- Database: Existing Prisma + SQLite
```

### 1.2 Key Architectural Decisions

Based on December 2025 best practices:

1. **No Middleware-Based Auth** (CVE-2025-29927 concerns)
   - Instead: Data Access Layer pattern
   - Auth checks in route handlers
   - Centralized auth service

2. **JWT Over Database Sessions**
   - Reduced database load
   - Serverless-friendly
   - Faster authentication checks
   - Still use DB for verification tokens

3. **Dual Authentication Methods**
   - Magic Link: User preference, simpler UX
   - OTP: Backup method, faster for repeat logins

4. **Domain-Based Access Control**
   - **Restricted to @williamtemple.org only**
   - Hardcoded domain validation (no configuration needed)
   - Small team of ~5 users expected

---

## 2. Authentication Methods

### 2.1 Magic Link Authentication

**User Flow:**
1. User enters email address
2. System sends magic link via Resend
3. Link expires in 10 minutes
4. User clicks link → auto-authenticated
5. JWT token issued in httpOnly cookie

**Technical Implementation:**
- Token: SHA-256 hashed, stored in `verification_token` table
- Format: `https://feed.williamtemple.app/api/auth/callback?token={token}&email={email}`
- One-time use: Token deleted after verification
- Resend integration: Custom email template with branded design

**Security Features:**
- 10-minute expiration
- Single-use tokens
- Token binding to specific email
- Rate limiting: Max 10 magic links per email per hour (generous for 5-person team)

### 2.2 OTP (One-Time Passcode) Authentication

**User Flow:**
1. User enters email address
2. User requests OTP code
3. System sends 6-digit code via Resend
4. Code expires in 3 minutes (180 seconds)
5. User enters code → verified
6. JWT token issued in httpOnly cookie

**Technical Implementation:**
- Code: 6-digit numeric (e.g., "742913")
- Storage: Hashed with SHA-256 in `verification_token` table
- Expiry: 180 seconds (industry standard for OTP)
- Attempts: Max 5 attempts before lockout

**Security Features:**
- 3-minute expiration window
- Rate limiting: Max 10 OTP requests per email per hour (generous for 5-person team)
- Failed attempt tracking with progressive lockout
- 10 failed attempts = 10-minute account lock (adjusted for small team)
- Automatic cleanup of expired tokens

### 2.3 Resend API Integration

**Service Configuration:**
```typescript
// Backend: packages/backend/src/services/email/resend-service.ts
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Magic Link Email
async function sendMagicLink(email: string, token: string) {
  const magicLink = `${process.env.APP_URL}/api/auth/callback?token=${token}&email=${email}`;
  
  await resend.emails.send({
    from: process.env.EMAIL_FROM || 'login@williamtemple.app',
    to: email,
    subject: 'Sign in to FEED System',
    html: MagicLinkTemplate({ magicLink, expiresIn: '10 minutes' })
  });
}

// OTP Email
async function sendOTP(email: string, code: string) {
  await resend.emails.send({
    from: process.env.EMAIL_FROM || 'login@williamtemple.app',
    to: email,
    subject: 'Your FEED verification code',
    html: OTPTemplate({ code, expiresIn: '3 minutes' })
  });
}
```

**Email Templates:**
- Custom React email templates (similar to Lotto app)
- Branded with William Temple House styling
- Mobile-responsive design
- Clear expiration messaging
- Security reminders

---

## 3. Database Schema

### 3.1 New Tables

Add to existing Prisma schema:

```prisma
// packages/backend/prisma/schema.prisma

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  emailVerified DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  sessions      Session[]
  accounts      Account[]
  
  @@index([email])
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String  // "email"
  provider          String  // "resend-magic" or "resend-otp"
  providerAccountId String
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@unique([provider, providerAccountId])
  @@index([userId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([userId])
  @@index([sessionToken])
}

model VerificationToken {
  identifier String   // email address
  token      String   // hashed token or OTP
  type       String   // "magic_link" or "otp"
  expires    DateTime
  createdAt  DateTime @default(now())
  
  @@unique([identifier, token])
  @@index([identifier])
  @@index([expires])
}

model OtpFailure {
  email       String   @id
  attempts    Int      @default(0)
  lockedUntil DateTime?
  lastRequest DateTime @default(now())
  
  @@index([email])
  @@index([lockedUntil])
}
```

### 3.2 Migration Strategy

**Step 1: Create Migration**
```bash
cd packages/backend
npx prisma migrate dev --name add_authentication_tables
npx prisma generate
```

**Step 2: Seed Initial Data (Optional)**
```typescript
// packages/backend/prisma/seed-auth.ts
// Pre-populate allowed domains or test users
```

---

## 4. Backend Implementation

### 4.1 Service Architecture

```
packages/backend/src/
├── services/
│   ├── auth/
│   │   ├── auth-service.ts         # Core auth logic
│   │   ├── token-service.ts        # JWT generation/validation
│   │   ├── verification-service.ts # Magic link & OTP handling
│   │   └── session-service.ts      # Session management
│   ├── email/
│   │   ├── resend-service.ts       # Resend API wrapper
│   │   └── templates/              # Email templates
│   │       ├── magic-link.tsx
│   │       └── otp-code.tsx
│   └── rate-limit/
│       └── auth-rate-limiter.ts    # Rate limiting logic
├── middleware/
│   └── auth/
│       ├── auth-middleware.ts      # Updated for JWT
│       └── require-auth.ts         # Protected route wrapper
└── routes/
    └── auth/
        ├── magic-link.ts           # POST /api/auth/magic-link
        ├── otp.ts                  # POST /api/auth/otp/*
        ├── callback.ts             # GET /api/auth/callback
        ├── session.ts              # GET /api/auth/session
        └── logout.ts               # POST /api/auth/logout
```

### 4.2 Core Services

#### 4.2.1 Token Service

```typescript
// packages/backend/src/services/auth/token-service.ts
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = '7d'; // 7 days

interface JWTPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export class TokenService {
  // Generate JWT
  static generateJWT(userId: string, email: string): string {
    return jwt.sign(
      { userId, email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
  }

  // Verify JWT
  static verifyJWT(token: string): JWTPayload | null {
    try {
      return jwt.verify(token, JWT_SECRET) as JWTPayload;
    } catch (error) {
      return null;
    }
  }

  // Generate verification token (for magic link/OTP)
  static generateVerificationToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  // Generate OTP code
  static generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Hash token for storage
  static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
```

#### 4.2.2 Verification Service

```typescript
// packages/backend/src/services/auth/verification-service.ts
import { prisma } from '@/db';
import { TokenService } from './token-service';
import { ResendService } from '../email/resend-service';

export class VerificationService {
  // Create and send magic link
  static async sendMagicLink(email: string): Promise<void> {
    const token = TokenService.generateVerificationToken();
    const hashedToken = TokenService.hashToken(token);
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store in database
    await prisma.verificationToken.create({
      data: {
        identifier: email.toLowerCase(),
        token: hashedToken,
        type: 'magic_link',
        expires
      }
    });

    // Send email via Resend
    await ResendService.sendMagicLink(email, token);
  }

  // Verify magic link
  static async verifyMagicLink(
    email: string,
    token: string
  ): Promise<string | null> {
    const hashedToken = TokenService.hashToken(token);
    
    const verification = await prisma.verificationToken.findFirst({
      where: {
        identifier: email.toLowerCase(),
        token: hashedToken,
        type: 'magic_link',
        expires: { gt: new Date() }
      }
    });

    if (!verification) return null;

    // Delete token (one-time use)
    await prisma.verificationToken.delete({
      where: {
        identifier_token: {
          identifier: email.toLowerCase(),
          token: hashedToken
        }
      }
    });

    // Get or create user
    const user = await this.findOrCreateUser(email);
    return user.id;
  }

  // Create and send OTP
  static async sendOTP(email: string): Promise<void> {
    // Check rate limit and lockout
    await this.checkOTPRateLimit(email);

    const code = TokenService.generateOTP();
    const hashedCode = TokenService.hashToken(code);
    const expires = new Date(Date.now() + 3 * 60 * 1000); // 3 minutes

    // Delete any existing OTP for this email
    await prisma.verificationToken.deleteMany({
      where: {
        identifier: email.toLowerCase(),
        type: 'otp'
      }
    });

    // Store in database
    await prisma.verificationToken.create({
      data: {
        identifier: email.toLowerCase(),
        token: hashedCode,
        type: 'otp',
        expires
      }
    });

    // Send email via Resend
    await ResendService.sendOTP(email, code);

    // Update OtpFailure record
    await prisma.otpFailure.upsert({
      where: { email: email.toLowerCase() },
      create: { email: email.toLowerCase(), attempts: 0, lastRequest: new Date() },
      update: { lastRequest: new Date() }
    });
  }

  // Verify OTP
  static async verifyOTP(email: string, code: string): Promise<string | null> {
    // Check if locked
    const failure = await prisma.otpFailure.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (failure?.lockedUntil && failure.lockedUntil > new Date()) {
      throw new Error('Account temporarily locked. Please try again later.');
    }

    const hashedCode = TokenService.hashToken(code);
    
    const verification = await prisma.verificationToken.findFirst({
      where: {
        identifier: email.toLowerCase(),
        token: hashedCode,
        type: 'otp',
        expires: { gt: new Date() }
      }
    });

    if (!verification) {
      // Increment failure count
      await this.recordOTPFailure(email);
      return null;
    }

    // Delete token (one-time use)
    await prisma.verificationToken.delete({
      where: {
        identifier_token: {
          identifier: email.toLowerCase(),
          token: hashedCode
        }
      }
    });

    // Reset failure count
    await prisma.otpFailure.upsert({
      where: { email: email.toLowerCase() },
      create: { email: email.toLowerCase(), attempts: 0 },
      update: { attempts: 0, lockedUntil: null }
    });

    // Get or create user
    const user = await this.findOrCreateUser(email);
    return user.id;
  }

  // Helper: Check OTP rate limit
  private static async checkOTPRateLimit(email: string): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const recentAttempts = await prisma.verificationToken.count({
      where: {
        identifier: email.toLowerCase(),
        type: 'otp',
        createdAt: { gt: oneHourAgo }
      }
    });

    if (recentAttempts >= 10) {
      throw new Error('Too many OTP requests. Please wait before requesting another code.');
    }
  }

  // Helper: Record OTP failure
  private static async recordOTPFailure(email: string): Promise<void> {
    const failure = await prisma.otpFailure.findUnique({
      where: { email: email.toLowerCase() }
    });

    const attempts = (failure?.attempts || 0) + 1;
    const lockedUntil = attempts >= 10 
      ? new Date(Date.now() + 10 * 60 * 1000) // 10 minute lockout
      : null;

    await prisma.otpFailure.upsert({
      where: { email: email.toLowerCase() },
      create: { email: email.toLowerCase(), attempts, lockedUntil },
      update: { attempts, lockedUntil }
    });
  }

  // Helper: Find or create user
  private static async findOrCreateUser(email: string) {
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingUser) return existingUser;

    return await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        emailVerified: new Date()
      }
    });
  }
}
```

### 4.3 API Routes

#### 4.3.1 Magic Link Route

```typescript
// packages/backend/src/routes/auth/magic-link.ts
import { Router } from 'express';
import { VerificationService } from '@/services/auth/verification-service';
import { z } from 'zod';

const router = Router();

const requestSchema = z.object({
  email: z.string().email()
});

// POST /api/auth/magic-link/request
router.post('/request', async (req, res) => {
  try {
    const { email } = requestSchema.parse(req.body);

    // Check domain allowlist
    if (!isAllowedDomain(email)) {
      return res.status(403).json({
        error: 'Email domain not allowed'
      });
    }

    await VerificationService.sendMagicLink(email);

    res.json({
      success: true,
      message: 'Magic link sent. Please check your email.'
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    
    console.error('Magic link error:', error);
    res.status(500).json({ error: 'Failed to send magic link' });
  }
});

// Domain validation - williamtemple.org only
function isAllowedDomain(email: string): boolean {
  return email.toLowerCase().endsWith('@williamtemple.org');
}

export default router;
```

#### 4.3.2 OTP Routes

```typescript
// packages/backend/src/routes/auth/otp.ts
import { Router } from 'express';
import { VerificationService } from '@/services/auth/verification-service';
import { z } from 'zod';

const router = Router();

const requestSchema = z.object({
  email: z.string().email()
});

const verifySchema = z.object({
  email: z.string().email(),
  code: z.string().length(6).regex(/^\d+$/)
});

// POST /api/auth/otp/request
router.post('/request', async (req, res) => {
  try {
    const { email } = requestSchema.parse(req.body);

    // Check domain allowlist
    if (!isAllowedDomain(email)) {
      return res.status(403).json({
        error: 'Email domain not allowed'
      });
    }

    await VerificationService.sendOTP(email);

    res.json({
      success: true,
      message: 'Verification code sent. Check your email.'
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    if (error instanceof Error && error.message.includes('Too many')) {
      return res.status(429).json({ error: error.message });
    }
    
    console.error('OTP request error:', error);
    res.status(500).json({ error: 'Failed to send verification code' });
  }
});

// POST /api/auth/otp/verify
router.post('/verify', async (req, res) => {
  try {
    const { email, code } = verifySchema.parse(req.body);

    const userId = await VerificationService.verifyOTP(email, code);

    if (!userId) {
      return res.status(401).json({
        error: 'Invalid or expired verification code'
      });
    }

    // Generate JWT
    const token = TokenService.generateJWT(userId, email);

    // Set httpOnly cookie
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      success: true,
      user: { id: userId, email }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input' });
    }

    if (error instanceof Error && error.message.includes('locked')) {
      return res.status(429).json({ error: error.message });
    }
    
    console.error('OTP verify error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

export default router;
```

### 4.4 Updated Auth Middleware

```typescript
// packages/backend/src/middleware/auth/auth-middleware.ts
import { Request, Response, NextFunction } from 'express';
import { TokenService } from '@/services/auth/token-service';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
      };
    }
  }
}

const PUBLIC_PATHS = [
  '/health',
  '/api/health',
  '/api/auth/',
  '/api/system/status',
  '/api/system/initialize'
];

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Skip auth for public paths
  if (PUBLIC_PATHS.some(path => req.path.startsWith(path))) {
    return next();
  }

  // Skip for internal Puppeteer requests
  if (req.headers['x-internal-pdf-request'] === 'true') {
    return next();
  }

  // Get token from cookie
  const token = req.cookies.auth_token;

  if (!token) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  // Verify JWT
  const payload = TokenService.verifyJWT(token);

  if (!payload) {
    // Clear invalid cookie
    res.clearCookie('auth_token');
    return res.status(401).json({
      error: 'Invalid or expired session',
      code: 'INVALID_TOKEN'
    });
  }

  // Attach user to request
  req.user = {
    userId: payload.userId,
    email: payload.email
  };

  next();
};
```

---

## 5. Frontend Implementation

### 5.1 Component Architecture

```
packages/frontend/src/
├── components/
│   └── auth/
│       ├── login-form.tsx          # Main login component
│       ├── magic-link-tab.tsx      # Magic link UI
│       ├── otp-tab.tsx             # OTP UI
│       └── otp-input.tsx           # 6-digit input component
├── contexts/
│   └── AuthContext.tsx             # Updated auth context
├── services/
│   └── auth/
│       └── auth-service.ts         # API calls
└── hooks/
    └── auth/
        ├── use-auth.ts             # Auth hook
        ├── use-magic-link.ts       # Magic link hook
        └── use-otp.ts              # OTP hook
```

### 5.2 Updated Auth Context

```typescript
// packages/frontend/src/contexts/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '@/services/auth/auth-service';

interface User {
  id: string;
  email: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  isLoading: boolean;
  checkSession: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  user: null,
  isLoading: true,
  checkSession: async () => {},
  logout: async () => {}
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkSession = async () => {
    try {
      const session = await authService.getSession();
      if (session.user) {
        setIsAuthenticated(true);
        setUser(session.user);
      } else {
        setIsAuthenticated(false);
        setUser(null);
      }
    } catch (error) {
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
      setIsAuthenticated(false);
      setUser(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  useEffect(() => {
    checkSession();
  }, []);

  return (
    <AuthContext.Provider value={{ 
      isAuthenticated, 
      user, 
      isLoading,
      checkSession,
      logout 
    }}>
      {children}
    </AuthContext.Provider>
  );
};
```

### 5.3 Login Component

```typescript
// packages/frontend/src/components/auth/login-form.tsx
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, KeyRound } from "lucide-react";
import { MagicLinkTab } from "./magic-link-tab";
import { OTPTab } from "./otp-tab";

export function LoginForm() {
  const [activeTab, setActiveTab] = useState<"magic" | "otp">("magic");

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Sign in to FEED System</CardTitle>
        <CardDescription>
          Staff access — use your @williamtemple.org email
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "magic" | "otp")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="magic" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Magic Link
            </TabsTrigger>
            <TabsTrigger value="otp" className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              Verification Code
            </TabsTrigger>
          </TabsList>

          <TabsContent value="magic">
            <MagicLinkTab />
          </TabsContent>

          <TabsContent value="otp">
            <OTPTab />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
```

### 5.4 OTP Input Component

```typescript
// packages/frontend/src/components/auth/otp-input.tsx
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

interface OTPInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function OTPInput({ value, onChange, disabled }: OTPInputProps) {
  return (
    <InputOTP
      maxLength={6}
      value={value}
      onChange={onChange}
      disabled={disabled}
    >
      <InputOTPGroup className="gap-2">
        {[0, 1, 2, 3, 4, 5].map((idx) => (
          <InputOTPSlot
            key={idx}
            index={idx}
            className="w-12 h-12 text-lg"
          />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}
```

---

## 6. Security Considerations

### 6.1 Token Security

**JWT Configuration:**
- Algorithm: HS256 (HMAC with SHA-256)
- Secret: Strong random secret (min 64 characters)
- Expiry: 7 days (configurable)
- Storage: httpOnly cookies (not localStorage)

**Verification Token Security:**
- Hashing: SHA-256 before database storage
- Length: 64 characters (32 bytes hex)
- One-time use: Deleted after successful verification
- Expiration: Automated cleanup via cron job

### 6.2 Rate Limiting

**Small Team Considerations:**
With only ~5 users, rate limits are generous to avoid frustrating legitimate users while still preventing abuse.

**Magic Link:**
- 10 requests per email per hour
- No IP-based limiting needed (small team, potentially same office)
- Track attempts in database

**OTP:**
- 10 OTP requests per email per hour
- 10 verification attempts before lockout
- 10-minute lockout after 10 failed attempts
- Lockout resets after successful authentication

**Implementation:**
```typescript
// Using express-rate-limit
import rateLimit from 'express-rate-limit';

const magicLinkLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Generous for 5-person team
  message: 'Too many magic link requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

const otpRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Generous for 5-person team
  message: 'Too many OTP requests. Please try again later.'
});
```

### 6.3 Domain Validation

**Single Domain Restriction:**
- **Hardcoded to @williamtemple.org only**
- No configuration needed - validation in code
- Simplifies setup for small team deployment

**Validation Logic:**
```typescript
function isAllowedDomain(email: string): boolean {
  return email.toLowerCase().endsWith('@williamtemple.org');
}
```

- Convert emails to lowercase before validation
- Reject any non-@williamtemple.org addresses
- Log all authentication attempts for audit

### 6.4 Cookie Security

**Production Cookie Configuration:**
```typescript
res.cookie('auth_token', token, {
  httpOnly: true,           // Prevent XSS attacks
  secure: true,             // HTTPS only in production
  sameSite: 'strict',       // CSRF protection
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
  domain: process.env.COOKIE_DOMAIN // .williamtemple.app for subdomains
});
```

### 6.5 GDPR & Data Privacy

**Compliance Measures:**
- Store minimal user data (email only initially)
- Automated token cleanup after expiration
- Clear privacy policy in login UI
- User can delete account via settings
- Audit trail for authentication events

**Token Cleanup Cron:**
```typescript
// Run daily at 3 AM
import cron from 'node-cron';

cron.schedule('0 3 * * *', async () => {
  await prisma.verificationToken.deleteMany({
    where: {
      expires: { lt: new Date() }
    }
  });
  console.log('Expired tokens cleaned up');
});
```

---

## 7. Migration Strategy

### 7.1 Phase 1: Foundation (Week 1)

**Backend Setup:**
1. Add authentication database tables
2. Run Prisma migrations
3. Install required dependencies:
   ```bash
   npm install jsonwebtoken resend zod
   npm install @types/jsonwebtoken --save-dev
   ```
4. Create auth service structure
5. Implement token generation/verification

**Frontend Setup:**
1. Update AuthContext with new structure
2. Create basic login form skeleton
3. Add API service layer

**Testing:**
- Unit tests for token service
- Database migration verification
- Manual testing of service methods

### 7.2 Phase 2: Magic Link Implementation (Week 2)

**Backend:**
1. Implement VerificationService.sendMagicLink
2. Create magic link email template
3. Add /api/auth/magic-link/request endpoint
4. Add /api/auth/callback endpoint
5. Configure Resend API integration

**Frontend:**
1. Create MagicLinkTab component
2. Implement request flow
3. Add success/error states
4. Test email delivery

**Testing:**
- Integration tests for magic link flow
- Email template rendering
- Token expiration testing

### 7.3 Phase 3: OTP Implementation (Week 3)

**Backend:**
1. Implement VerificationService.sendOTP/verifyOTP
2. Create OTP email template
3. Add /api/auth/otp/* endpoints
4. Implement rate limiting
5. Add OtpFailure tracking

**Frontend:**
1. Create OTPTab component
2. Build OTPInput component
3. Implement verification flow
4. Add countdown timer
5. Handle lockout states

**Testing:**
- OTP generation uniqueness
- Rate limiting verification
- Lockout mechanism testing

### 7.4 Phase 4: JWT & Session Management (Week 4)

**Backend:**
1. Update auth middleware for JWT
2. Implement session validation
3. Add logout endpoint
4. Configure cookie settings
5. Add session refresh logic

**Frontend:**
1. Update AuthContext for session checking
2. Implement logout functionality
3. Add session expiry handling
4. Update ProtectedRoute component

**Testing:**
- JWT validation testing
- Cookie security verification
- Session persistence testing

### 7.5 Phase 5: Migration & Cleanup (Week 5)

**Migration:**
1. Create migration documentation
2. Deploy to staging environment
3. Test complete authentication flow
4. Verify all existing features still work
5. Performance testing

**Cleanup:**
1. Remove old Basic Auth code
2. Update environment variables
3. Archive old auth documentation
4. Update README with new auth info

**Rollback Plan:**
- Keep old auth code commented out initially
- Feature flag for new auth system
- Quick rollback procedure documented

---

## 8. Testing Strategy

### 8.1 Unit Tests

**Token Service:**
```typescript
// packages/backend/src/services/auth/__tests__/token-service.test.ts
describe('TokenService', () => {
  describe('generateJWT', () => {
    it('generates valid JWT with correct payload', () => {
      const token = TokenService.generateJWT('user123', 'test@example.com');
      const payload = TokenService.verifyJWT(token);
      
      expect(payload).toBeDefined();
      expect(payload?.userId).toBe('user123');
      expect(payload?.email).toBe('test@example.com');
    });

    it('JWT expires after configured time', () => {
      // Test with short expiry for fast testing
    });
  });

  describe('generateOTP', () => {
    it('generates 6-digit numeric code', () => {
      const otp = TokenService.generateOTP();
      expect(otp).toMatch(/^\d{6}$/);
    });

    it('generates unique codes', () => {
      const codes = new Set();
      for (let i = 0; i < 100; i++) {
        codes.add(TokenService.generateOTP());
      }
      expect(codes.size).toBeGreaterThan(90); // Allow some collisions
    });
  });
});
```

### 8.2 Integration Tests

**Magic Link Flow:**
```typescript
describe('Magic Link Authentication', () => {
  it('sends magic link and authenticates user', async () => {
    // 1. Request magic link
    const response = await request(app)
      .post('/api/auth/magic-link/request')
      .send({ email: 'test@williamtemple.org' });

    expect(response.status).toBe(200);

    // 2. Get token from database
    const verification = await prisma.verificationToken.findFirst({
      where: { identifier: 'test@williamtemple.org' }
    });

    expect(verification).toBeDefined();

    // 3. Use magic link
    const callbackResponse = await request(app)
      .get('/api/auth/callback')
      .query({ 
        email: 'test@williamtemple.org',
        token: verification!.token 
      });

    expect(callbackResponse.status).toBe(302); // Redirect
    expect(callbackResponse.headers['set-cookie']).toBeDefined();
  });
});
```

### 8.3 E2E Tests

**Complete Login Flow:**
```typescript
// Using Playwright or Cypress
describe('User Authentication E2E', () => {
  it('user can login with magic link', async () => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'test@williamtemple.org');
    await page.click('button:has-text("Send magic link")');
    
    // Wait for success message
    await expect(page.locator('text=Check your email')).toBeVisible();
    
    // In real test, would check email inbox or use test token
    // For testing, implement a test endpoint that returns the token
    
    const token = await getTestToken('test@williamtemple.org');
    await page.goto(`/api/auth/callback?email=test@williamtemple.org&token=${token}`);
    
    // Verify redirect to dashboard
    await expect(page).toHaveURL('/dashboard');
  });
});
```

---

## 9. Deployment Checklist

### 9.1 Environment Variables

**Production .env:**
```bash
# Authentication
JWT_SECRET="[64+ character random string - CHANGE IN PRODUCTION]"
ALLOWED_EMAIL_DOMAINS="williamtemple.org"

# Resend API
RESEND_API_KEY="[Your Resend API key]"
EMAIL_FROM="login@williamtemple.app"

# Application URLs
APP_URL="https://feed.williamtemple.app"
COOKIE_DOMAIN=".williamtemple.app"

# Database
DATABASE_URL="file:./production.db"

# Feature Flags
FORCE_AUTH=true
NODE_ENV=production
```

### 9.2 Pre-Deployment Tasks

- [ ] Run database migrations on production
- [ ] Generate strong JWT secret (use `openssl rand -base64 64`)
- [ ] Configure Resend API key
- [ ] Set up domain verification in Resend
- [ ] Test email delivery in production
- [ ] Configure HTTPS/SSL certificates
- [ ] Set up cookie domain correctly
- [ ] Enable rate limiting
- [ ] Configure logging for auth events
- [ ] Set up monitoring/alerting

### 9.3 Post-Deployment Verification

- [ ] Test magic link flow end-to-end
- [ ] Test OTP flow end-to-end
- [ ] Verify JWT expiration works correctly
- [ ] Test rate limiting triggers
- [ ] Verify lockout mechanism
- [ ] Check email delivery speed
- [ ] Test logout functionality
- [ ] Verify session persistence across page reloads
- [ ] Test on multiple browsers
- [ ] Mobile responsiveness check

### 9.4 Monitoring Setup

**Key Metrics to Track:**
- Authentication success/failure rates
- Email delivery time
- Token expiration rates
- Rate limit triggers
- Lockout occurrences
- Session duration
- API response times

**Logging:**
```typescript
// Authentication event logging
logger.info('Authentication event', {
  event: 'magic_link_sent',
  email: email.toLowerCase(),
  timestamp: new Date().toISOString(),
  ip: req.ip
});
```

---

## 10. Rollback Plan

### 10.1 Feature Flag Strategy

**Implementation:**
```typescript
// .env
USE_NEW_AUTH=true

// Backend middleware
if (process.env.USE_NEW_AUTH === 'true') {
  app.use(newAuthMiddleware);
} else {
  app.use(oldBasicAuthMiddleware);
}
```

### 10.2 Rollback Procedure

**If issues occur:**

1. **Immediate Rollback (< 5 minutes):**
   ```bash
   # Set feature flag
   USE_NEW_AUTH=false
   
   # Restart application
   pm2 restart feed-backend
   pm2 restart feed-frontend
   ```

2. **Database Rollback (if needed):**
   ```bash
   cd packages/backend
   npx prisma migrate down --name add_authentication_tables
   ```

3. **Code Rollback:**
   ```bash
   git checkout previous-stable-tag
   npm install
   npm run build
   pm2 restart all
   ```

### 10.3 Rollback Testing

**Before deployment, test rollback:**
- Deploy to staging with new auth
- Test rollback procedure
- Verify old auth works after rollback
- Document any issues encountered

---

## Appendix A: Dependencies

### Backend Dependencies
```json
{
  "dependencies": {
    "jsonwebtoken": "^9.0.2",
    "resend": "^4.0.0",
    "zod": "^3.22.4",
    "express-rate-limit": "^7.1.5",
    "cookie-parser": "^1.4.6",
    "node-cron": "^3.0.3"
  },
  "devDependencies": {
    "@types/jsonwebtoken": "^9.0.5",
    "@types/cookie-parser": "^1.4.6",
    "@types/node-cron": "^3.0.11"
  }
}
```

### Frontend Dependencies
```json
{
  "dependencies": {
    "@radix-ui/react-tabs": "^1.0.4",
    "input-otp": "^1.2.4"
  }
}
```

---

## Appendix B: Email Templates

### Magic Link Email Template

```tsx
// packages/backend/src/services/email/templates/magic-link.tsx
import * as React from 'react';
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from '@react-email/components';

interface MagicLinkEmailProps {
  magicLink: string;
  expiresIn: string;
}

export const MagicLinkEmail = ({ magicLink, expiresIn }: MagicLinkEmailProps) => (
  <Html>
    <Head />
    <Preview>Sign in to FEED System</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Sign in to FEED System</Heading>
        <Text style={text}>
          Click the button below to sign in to your account. This link expires in {expiresIn}.
        </Text>
        <Button style={button} href={magicLink}>
          Sign In
        </Button>
        <Text style={footer}>
          If you didn't request this email, you can safely ignore it.
        </Text>
      </Container>
    </Body>
  </Html>
);

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
};

const h1 = {
  color: '#333',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '40px 0',
  padding: '0',
  textAlign: 'center' as const,
};

const text = {
  color: '#333',
  fontSize: '16px',
  lineHeight: '26px',
  textAlign: 'center' as const,
};

const button = {
  backgroundColor: '#000',
  borderRadius: '5px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  width: '200px',
  margin: '30px auto',
  padding: '12px 20px',
};

const footer = {
  color: '#8898aa',
  fontSize: '12px',
  lineHeight: '16px',
  textAlign: 'center' as const,
  marginTop: '40px',
};
```

### OTP Email Template

```tsx
// packages/backend/src/services/email/templates/otp-code.tsx
import * as React from 'react';
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from '@react-email/components';

interface OTPEmailProps {
  code: string;
  expiresIn: string;
}

export const OTPEmail = ({ code, expiresIn }: OTPEmailProps) => (
  <Html>
    <Head />
    <Preview>Your FEED verification code</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Your Verification Code</Heading>
        <Text style={text}>
          Enter this code to sign in to your FEED account:
        </Text>
        <Text style={codeText}>{code}</Text>
        <Text style={text}>
          This code expires in {expiresIn}.
        </Text>
        <Text style={footer}>
          If you didn't request this code, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
);

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
};

const h1 = {
  color: '#333',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '40px 0',
  padding: '0',
  textAlign: 'center' as const,
};

const text = {
  color: '#333',
  fontSize: '16px',
  lineHeight: '26px',
  textAlign: 'center' as const,
};

const codeText = {
  fontSize: '32px',
  fontWeight: 'bold',
  color: '#000',
  textAlign: 'center' as const,
  letterSpacing: '8px',
  margin: '30px 0',
  fontFamily: 'monospace',
};

const footer = {
  color: '#8898aa',
  fontSize: '12px',
  lineHeight: '16px',
  textAlign: 'center' as const,
  marginTop: '40px',
};
```

---

## Appendix C: Configuration Examples

### Complete .env.example

```bash
# ===================================
# AUTHENTICATION CONFIGURATION
# ===================================

# JWT Secret - Generate with: openssl rand -base64 64
# CRITICAL: Change this in production!
JWT_SECRET="your-super-secret-jwt-key-minimum-64-characters-for-security"

# JWT Expiration (e.g., "7d", "24h", "30m")
JWT_EXPIRES_IN="7d"

# Domain restriction is hardcoded to @williamtemple.org
# No configuration needed - see domain validation in code

# ===================================
# RESEND EMAIL SERVICE
# ===================================

# Resend API Key (get from resend.com)
RESEND_API_KEY="re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Email sender address (must be verified in Resend)
EMAIL_FROM="login@williamtemple.app"

# ===================================
# APPLICATION URLS
# ===================================

# Application base URL (no trailing slash)
APP_URL="http://localhost:5173"

# Cookie domain for session management
# Production: ".williamtemple.app" (allows subdomains)
# Development: "localhost"
COOKIE_DOMAIN="localhost"

# ===================================
# SECURITY SETTINGS
# ===================================

# Force authentication even in development
FORCE_AUTH=true

# Node environment
NODE_ENV=development

# Rate limiting is configured via AI Configuration records in the database
# (tokensPerMinute, requestsPerMinute, requestsPerDay)

# ===================================
# FEATURE FLAGS
# ===================================

# Use new authentication system
USE_NEW_AUTH=true

# ===================================
# DATABASE
# ===================================

DATABASE_URL="file:./dev.db"
```

---

## Appendix D: Timeline & Resource Allocation

### Estimated Timeline: 5 Weeks

**Week 1: Foundation**
- Backend: 16 hours
- Frontend: 8 hours
- Testing: 4 hours
- Total: 28 hours

**Week 2: Magic Link**
- Backend: 12 hours
- Frontend: 8 hours
- Email Templates: 4 hours
- Testing: 4 hours
- Total: 28 hours

**Week 3: OTP**
- Backend: 12 hours
- Frontend: 10 hours
- Testing: 6 hours
- Total: 28 hours

**Week 4: JWT & Sessions**
- Backend: 10 hours
- Frontend: 8 hours
- Integration: 6 hours
- Testing: 4 hours
- Total: 28 hours

**Week 5: Migration & Polish**
- Migration: 8 hours
- Documentation: 6 hours
- Testing: 8 hours
- Deployment: 6 hours
- Total: 28 hours

**Grand Total: 140 hours (~4 weeks full-time or 5 weeks part-time)**

---

## Appendix E: Success Criteria

### Technical Success Metrics

1. **Security:**
   - ✅ All passwords/secrets hashed with SHA-256
   - ✅ JWT tokens expire correctly
   - ✅ Rate limiting prevents abuse
   - ✅ No XSS/CSRF vulnerabilities

2. **Functionality:**
   - ✅ Magic link success rate > 95%
   - ✅ OTP delivery time < 10 seconds
   - ✅ Session persistence across page reloads
   - ✅ Logout works correctly

3. **Performance:**
   - ✅ Authentication check < 50ms
   - ✅ Email delivery < 5 seconds
   - ✅ No database deadlocks
   - ✅ Handle 100 concurrent auth requests

4. **User Experience:**
   - ✅ Clear error messages
   - ✅ Intuitive UI flow
   - ✅ Mobile-friendly design
   - ✅ Accessible (WCAG 2.1 AA)

### Business Success Metrics

1. **Adoption:**
   - Target: 100% staff migration within 2 weeks
   - Monitor: Login method preferences

2. **Security:**
   - Zero unauthorized access incidents
   - All authentication events logged

3. **Reliability:**
   - 99.9% authentication uptime
   - < 1% failed authentication rate (excluding user error)

---

## Conclusion

This plan provides a comprehensive roadmap for implementing production-ready authentication in the FEED application. By following industry best practices from December 2025 and leveraging lessons from successful implementations (Lotto and Zev apps), we can deliver a secure, user-friendly authentication system that will serve William Temple House well into the future.

The phased approach allows for incremental delivery and testing, while the rollback plan ensures we can quickly revert if issues arise. The estimated 5-week timeline is aggressive but achievable with focused effort.

### Next Steps

1. **Review this plan** with stakeholders
2. **Get approval** for Resend API costs (~$20/month for estimated volume)
3. **Set up staging environment** for testing
4. **Begin Week 1** foundation work
5. **Schedule weekly check-ins** to track progress

---

**Document Status:** Draft v1.0  
**Last Updated:** December 9, 2025  
**Review Date:** December 16, 2025
