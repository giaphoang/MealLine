// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { describe, expect, test } from 'vitest';
import { foodIcons, iconsByCategory } from '@/lib/icon-library';

const requestedIcons = [
  'ellipse', 'circle', 'square', 'triangle', 'astroid', 'circle-small',
  'diamond', 'hexagon', 'pentagon', 'cuboid', 'pyramid', 'cone',
  'lens-concave', 'star', 'heart', 'spade', 'club', 'ban', 'accessibility',
  'heart-pulse', 'music', 'circle-parking', 'radiation', 'tent-tree', 'tent',
  'flame-kindling', 'caravan', 'backpack', 'rose', 'stone', 'flower-2', 'bug',
  'paper-bag', 'luggage', 'shopping-bag', 'scroll-text', 'receipt-text',
  'list-todo', 'calculator', 'pointer', 'eclipse', 'clipboard-minus',
];

describe('shared FEED icon library', () => {
  test('contains every requested category and Service metric icon exactly once', () => {
    const values = foodIcons.map((icon) => icon.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values).toEqual(expect.arrayContaining(requestedIcons));
  });

  test('exposes the new groups to every shared picker', () => {
    expect(iconsByCategory.shapes).toHaveLength(23);
    expect(iconsByCategory.outdoor.map((icon) => icon.value)).toEqual(expect.arrayContaining([
      'tent-tree', 'tent', 'flame-kindling', 'caravan', 'backpack', 'rose',
      'stone', 'flower-2', 'bug',
    ]));
  });
});
