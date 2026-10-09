// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React from 'react';

interface BuiltWithClaudeProps {
  className?: string;
}

export function BuiltWithClaude({ className = '' }: BuiltWithClaudeProps) {
  return (
    <div className={`text-xs text-muted-foreground ${className}`}>
      <a 
        href="https://www.anthropic.com" 
        target="_blank" 
        rel="noopener noreferrer"
        className="built-with-claude hover:text-foreground transition-colors duration-200 no-underline"
      >
        Built With Claude
      </a>
    </div>
  );
}
