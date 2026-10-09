// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Request, Response, NextFunction } from 'express';

export const jsonErrorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      error: {
        message: 'The data you submitted contains invalid formatting. Please check your input and try again.',
        timestamp: new Date().toISOString()
      }
    });
  }
  next(err);
};