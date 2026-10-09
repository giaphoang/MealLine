// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

export interface Translation {
  id: number
  key: string
  text: string
  language: string
  createdAt: string
  updatedAt: string
}

export interface StatusMessage {
  type: 'success' | 'error' | 'info'
  message: string
}