// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { optimize } from '@tailwindcss/node';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

// Exercise the production optimizer: dev CSS and computed source declarations
// both concealed #85 because only the optimized build dropped Chrome's blur.
const source = readFileSync(join(__dirname, '../index.css'), 'utf8');
const surfaces = postcss.root();
postcss.parse(source).walkRules(rule => {
  if (rule.nodes.some(node => node.type === 'decl' && node.prop === 'backdrop-filter')) {
    surfaces.append(rule.clone());
  }
});
const built = postcss.parse(optimize(surfaces.toString(), { minify: true }).code);

describe('production shell backdrop filters', () => {
  it.each([
    ['.feed-shell-header-panel', 'blur(14px)saturate(1.5)'],
    ['.feed-shell-panel', 'blur(16px)'],
    ['.feed-shell-sidebar [data-sidebar=sidebar]', 'blur(16px)'],
    ['.print-theme .feed-shell-header-panel', 'none'],
  ])('preserves Chrome and Safari declarations for %s', (selector, value) => {
    const declarations: Record<string, string> = {};
    built.walkRules(rule => {
      if (!rule.selectors.includes(selector)) return;
      rule.walkDecls(decl => {
        declarations[decl.prop] = decl.value.replace(/\s+/g, '');
      });
    });
    expect(declarations['backdrop-filter']).toBe(value);
    expect(declarations['-webkit-backdrop-filter']).toBe(value);
  });
});
