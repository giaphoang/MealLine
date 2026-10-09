// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { SUPPORT_CONTACT_SENTENCE } from '../lib/support';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export const INTERNAL_FAILURE_MESSAGE =
  `FEED could not complete that request. Please try again. ${SUPPORT_CONTACT_SENTENCE}`;

/**
 * Type guard for Prisma errors
 */
const isPrismaError = (error: any): error is Prisma.PrismaClientKnownRequestError => {
  return error && 
    error instanceof Error && 
    error.name === 'PrismaClientKnownRequestError' && 
    'code' in error;
};

/**
 * Environment-aware error logging
 */
const logError = (message: string, details?: unknown) => {
  if (process.env.NODE_ENV === 'development') {
    console.error(`[Error] ${message}`, details);
  }
};

/**
 * Global error handler middleware
 */
export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) => {
  // Basic error info for logging
  const errorInfo = {
    name: err.name,
    message: err.message,
    code: err.code,
    path: req.path,
    method: req.method
  };

  // Log error in development
  logError('Request failed', errorInfo);

  // Format timestamp
  const timestamp = new Date().toISOString();

  // Handle Multer errors
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: {
          message: 'Please upload a smaller file. The maximum size allowed is 5MB.',
          timestamp,
          code: 'LIMIT_FILE_SIZE'
        }
      });
    }
    
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        error: {
          message: 'Please select a valid file type for upload.',
          timestamp,
          code: 'LIMIT_UNEXPECTED_FILE'
        }
      });
    }
  }

  // Handle Prisma errors
  if (isPrismaError(err)) {
    if (err.code === 'P2002') {
      // Extract the field name from the error meta if available
      const target = err.meta?.target as string[] || [];
      const fieldName = target[0] || 'name';
      
      return res.status(400).json({
        error: {
          message: `An item with this ${fieldName} already exists. Please choose a different ${fieldName}.`,
          timestamp,
          code: err.code
        }
      });
    }
    
    if (err.code === 'P2003') {
      // P2003 is "foreign key constraint failed", which covers writes in both
      // directions. This used to assert a deletion, and that assertion sent a
      // restore investigation looking at delete ordering for two turns while
      // the real failure was an INSERT of rows whose parent the destination
      // did not have (ISSUES.md #81). Name the constraint, not a guess at
      // which operation tripped it.
      return res.status(400).json({
        error: {
          message:
            'That change would break a link between records. If you are deleting something, '
            + 'reassign or remove the items that point at it first.',
          timestamp,
          code: err.code
        }
      });
    }
    
    if (err.code === 'P2025') {
      return res.status(404).json({
        error: {
          message: 'The requested item could not be found. It may have been deleted or moved.',
          timestamp,
          code: err.code
        }
      });
    }
  }

  // Set status code and format response
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // Only messages the application deliberately wrote for a user are safe to
  // send to the browser. An error that reaches here without an explicit
  // statusCode is an internal failure -- a Prisma validation error, a
  // TypeError, a driver fault -- and its message is a developer artifact that
  // can carry absolute server paths, query structure, and schema details.
  // Those are unhelpful to staff and should not leave the server, so they are
  // logged and replaced rather than forwarded.
  //
  // The signature of a deliberate message is the explicit statusCode, not the
  // 4xx range. This gate used to stop at 499, which silently discarded every
  // curated 5xx message in the app: the translate-missing-strings route names
  // the language and says whether to retry, and staff were shown the generic
  // internal-failure text instead (ISSUES.md #80). The same was true of the
  // retired shopping-list PDF routes' 503s and the friendly 500s in
  // quarantine, storage reconciliation, and global-limit. Accidental errors
  // still carry no statusCode and are still withheld.
  const carriesUserFacingMessage =
    typeof err.statusCode === 'number' && err.statusCode >= 400;

  let friendlyMessage = carriesUserFacingMessage ? message : INTERNAL_FAILURE_MESSAGE;

  if (!carriesUserFacingMessage) {
    console.error('[Error] Internal failure withheld from client', {
      ...errorInfo,
      stack: err.stack,
    });
  }

  // Status-code defaults for errors whose message is a bare HTTP phrase.
  // A 500 needs no branch here: the withheld-message default above already
  // covers it, and that default now carries the issue-tracker link.
  if (statusCode === 404 && (!err.message || err.message === 'Not Found')) {
    friendlyMessage = 'The requested resource could not be found. It may have been moved or deleted.';
  } else if (statusCode === 401 && (!err.message || err.message === 'Unauthorized')) {
    friendlyMessage = 'Please log in to access this feature.';
  } else if (statusCode === 403 && (!err.message || err.message === 'Forbidden')) {
    friendlyMessage = 'You don\'t have permission to access this resource.';
  } else if (statusCode === 400 && (!err.message || err.message === 'Bad Request')) {
    friendlyMessage = 'There was a problem with your request. Please check your input and try again.';
  } else if (statusCode === 429 && (!err.message || err.message === 'Too Many Requests')) {
    friendlyMessage = 'You\'ve made too many requests. Please wait a minute and try again.';
  }
  
  // Format error response
  res.status(statusCode).json({
    error: {
      message: friendlyMessage,
      timestamp,
      code: err.code || 'INTERNAL_ERROR'
    }
  });
};