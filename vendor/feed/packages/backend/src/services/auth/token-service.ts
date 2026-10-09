// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET: Secret | undefined = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn'];

interface JWTPayload {
  userId: string;
  email: string;
  developmentLogin?: boolean;
  iat?: number;
  exp?: number;
}

export class TokenService {
  /** A separate, short-lived marker makes these sessions invalid outside the
   * explicitly enabled local development mode, even with the same JWT key. */
  static generateDevelopmentJWT(userId: string, email: string): string {
    if (!JWT_SECRET) throw new Error('JWT_SECRET not configured');
    return jwt.sign({ userId, email, developmentLogin: true }, JWT_SECRET, { expiresIn: '1h' });
  }

  /**
   * Generate JWT for authenticated user
   */
  static generateJWT(userId: string, email: string): string {
    if (!JWT_SECRET) {
      throw new Error('JWT_SECRET not configured');
    }

    return jwt.sign(
      { userId, email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
  }

  /**
   * Verify and decode JWT
   */
  static verifyJWT(token: string): JWTPayload | null {
    if (!JWT_SECRET) {
      throw new Error('JWT_SECRET not configured');
    }

    try {
      return jwt.verify(token, JWT_SECRET) as JWTPayload;
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate cryptographically secure verification token
   */
  static generateVerificationToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate 6-digit OTP code
   */
  static generateOTP(): string {
    return String(crypto.randomInt(100000, 1000000));
  }

  /**
   * Hash token for database storage
   */
  static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
