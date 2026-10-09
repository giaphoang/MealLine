// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

// Load environment variables (only enable Basic Auth when explicitly configured)
const USERNAME = process.env.AUTH_USERNAME;
const PASSWORD = process.env.AUTH_PASSWORD;

// Predefined whitelist for paths that should not require authentication
const PUBLIC_PATHS: string[] = [
  '/health', // Health check endpoint
  '/api/health', // API health check endpoint
  '/api/system/status', // System initialization status check
  '/api/auth/test', // Authentication test endpoints (Stage 2)
  '/api/auth', // Authentication endpoints (Stage 4)
];

/**
 * Checks if the given path is in the public paths whitelist
 */
const isPublicPath = (path: string): boolean => {
  return PUBLIC_PATHS.some(publicPath => path.startsWith(publicPath));
};

/**
 * Validates if the authentication credentials are properly configured
 */
const validateAuthConfig = (): boolean => {
  if (!USERNAME || !PASSWORD) {
    console.warn('Basic Auth is disabled: Missing AUTH_USERNAME and/or AUTH_PASSWORD');
    return false;
  }
  return true;
};

/**
 * Basic HTTP Authentication middleware
 * Implements secure authentication for all API routes
 */
export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Skip Basic Auth if JWT already validated
  if (req.auth?.userId) {
    return next();
  }

  // Skip authentication for whitelisted paths (must be first)
  if (isPublicPath(req.path)) {
    return next();
  }

  // Skip authentication for development environment unless explicitly enabled
  if (process.env.NODE_ENV === 'development' && process.env.FORCE_AUTH !== 'true') {
    return next();
  }

  // Check if authentication is properly configured
  if (!validateAuthConfig()) {
    if (process.env.FORCE_AUTH === 'true' || process.env.NODE_ENV === 'production') {
      return res.status(401).json({ error: { message: 'Sign in to MealLine to access this feature.', code: 'AUTH_REQUIRED' } });
    }
    // Keep upstream's explicit isolated-test/development mode; the MealLine
    // launcher always sets FORCE_AUTH, including during local development.
    return next();
  }

  // Check for auth in query parameter (used for EventSource which doesn't support headers)
  if (req.query.auth) {
    try {
      const credentials = Buffer.from(req.query.auth as string, 'base64').toString('utf-8');
      const [username, password] = credentials.split(':');
      
      if (username === USERNAME && password === PASSWORD) {
        return next();
      }
    } catch (error) {
      console.error('Authentication error in query parameter:', error);
    }
  }

  // Get authorization header
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    // No authorization header - send authentication challenge
    res.setHeader('WWW-Authenticate', 'Basic realm="FEED: Access Restricted"');
    return res.status(401).json({
      error: {
        message: 'Please log in to access this feature. If you need assistance, contact the administrator at github.com/MattGeiger',
        code: 'AUTH_REQUIRED',
        timestamp: new Date().toISOString(),
      }
    });
  }

  // Parse authorization header
  try {
    // Basic auth format: "Basic base64(username:password)"
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    // For simple comparison with hardcoded credentials
    if (username === USERNAME && password === PASSWORD) {
      return next();
    }

    // Log failed authentication attempts (but don't include credentials)
    console.warn(`Failed authentication attempt from IP: ${req.ip}`);
    
    // Invalid credentials - send authentication challenge
    res.setHeader('WWW-Authenticate', 'Basic realm="FEED: Access Restricted"');
    return res.status(401).json({
      error: {
        message: 'The username or password you entered is incorrect. Please try again or contact the administrator at github.com/MattGeiger',
        code: 'INVALID_CREDENTIALS',
        timestamp: new Date().toISOString(),
      }
    });
  } catch (error) {
    // Error parsing credentials - send authentication challenge
    console.error('Authentication error:', error);
    res.setHeader('WWW-Authenticate', 'Basic realm="FEED: Access Restricted"');
    return res.status(401).json({
      error: {
        message: 'There was a problem verifying your login. Please try clearing your browser cache and logging in again, or contact the administrator at github.com/MattGeiger',
        code: 'AUTH_ERROR',
        timestamp: new Date().toISOString(),
      }
    });
  }
};
