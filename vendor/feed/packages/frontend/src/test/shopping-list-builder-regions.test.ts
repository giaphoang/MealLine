// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { describe, expect, it } from 'vitest';
import { createDefaultBuilderTemplate } from '@/components/shopping-lists/builder/default-template';
import {
  DEFAULT_BUILDER_COMPONENT_WIDTH,
  DEFAULT_GRID_SIZE,
  DEFAULT_SECTION_TABLE_ROW_HEIGHT,
  getCenteredXInBodyHalf,
  getTemplateGridSize,
  getTemplateBodyLaneBounds,
  getTemplateBodyLayoutMode,
  getTemplateFooterHeight,
  getTemplateHeaderHeight,
  getTemplateLayoutMode,
  getTemplateRegionBounds,
  normalizeLegacyBuilderTemplateGeometry,
  normalizeSectionTableTranslationHeightAdjustment,
  ShoppingListBuilderTemplate,
  snapToGrid,
} from '@/components/shopping-lists/builder/types';

const createTemplate = (
  headerHeight = 54,
  footerHeight = 45,
): ShoppingListBuilderTemplate => ({
  id: 'region-test',
  name: 'Region Test',
  paper: {
    size: 'letter',
    width: 612,
    height: 792,
    unit: 'pt',
  },
  headerHeight,
  footerHeight,
  components: [],
});

describe('shopping list builder page regions', () => {
  it('opens new builder sessions with a blank guided split-page canvas', () => {
    const template = createDefaultBuilderTemplate();

    expect(template.name).toBe('Untitled Shopping List Template');
    expect(template.components).toEqual([]);
    expect(getTemplateLayoutMode(template)).toBe('guided');
    expect(getTemplateBodyLayoutMode(template)).toBe('split');
    expect(getTemplateGridSize(template)).toBe(DEFAULT_GRID_SIZE);
    expect(getTemplateHeaderHeight(template)).toBe(36);
    expect(getTemplateFooterHeight(template)).toBe(36);
  });

  it('derives header, body, and footer bounds from page setup values', () => {
    const template = createTemplate();

    expect(getTemplateRegionBounds(template, 'header')).toMatchObject({
      top: 0,
      bottom: 54,
      height: 54,
    });
    expect(getTemplateRegionBounds(template, 'body')).toMatchObject({
      top: 54,
      bottom: 747,
      height: 693,
    });
    expect(getTemplateRegionBounds(template, 'footer')).toMatchObject({
      top: 747,
      bottom: 792,
      height: 45,
    });
  });

  it('treats zero-height header or footer regions as unavailable space', () => {
    const template = createTemplate(0, 0);

    expect(getTemplateRegionBounds(template, 'header').height).toBe(0);
    expect(getTemplateRegionBounds(template, 'footer').height).toBe(0);
    expect(getTemplateRegionBounds(template, 'body')).toMatchObject({
      top: 0,
      bottom: 792,
      height: 792,
    });
  });

  it('snaps values to the active grid size', () => {
    expect(snapToGrid(100, DEFAULT_GRID_SIZE)).toBe(99);
    expect(snapToGrid(100, 0)).toBe(100);
  });

  it('derives split body lanes from the body region and column gap', () => {
    const template: ShoppingListBuilderTemplate = {
      ...createTemplate(),
      bodyLayoutMode: 'split',
      bodyColumnGap: 18,
    };

    expect(getTemplateBodyLaneBounds(template, 'left')).toMatchObject({
      left: 0,
      right: 297,
      width: 297,
      top: 54,
      bottom: 747,
      height: 693,
    });
    expect(getTemplateBodyLaneBounds(template, 'right')).toMatchObject({
      left: 315,
      right: 612,
      width: 297,
      top: 54,
      bottom: 747,
      height: 693,
    });
  });

  it('centers default-width components inside split-page halves on the 9pt grid', () => {
    expect(getCenteredXInBodyHalf(612, DEFAULT_BUILDER_COMPONENT_WIDTH, 'left', 9)).toBe(18);
    expect(getCenteredXInBodyHalf(612, DEFAULT_BUILDER_COMPONENT_WIDTH, 'right', 9)).toBe(324);
  });

  it('normalizes legacy builder geometry before preview planning', () => {
    const normalized = normalizeLegacyBuilderTemplateGeometry({
      ...createTemplate(),
      gridSize: 9,
      components: [
        {
          id: 'legacy-table',
          type: 'section-table',
          name: 'Legacy table',
          region: 'body',
          x: 0,
          y: 54,
          width: 253,
          height: 72,
          title: 'Legacy table',
          rows: [{ id: 'row-1', item: 'Beans', limit: '' }],
          showLimit: true,
          limitHeader: 'Limit',
          wantHeader: 'Want',
          limitWidth: 48,
          wantWidth: 49,
          fontSize: 10,
          rowHeight: 18,
          alternateRows: true,
        },
      ],
    });

    expect(normalized.gridSize).toBe(DEFAULT_GRID_SIZE);
    expect((normalized.components[0] as any).rowHeight).toBe(DEFAULT_SECTION_TABLE_ROW_HEIGHT);
  });

  it('allows translated table preview height adjustments up to nine grid squares', () => {
    expect(normalizeSectionTableTranslationHeightAdjustment(12)).toBe(9);
    expect(normalizeSectionTableTranslationHeightAdjustment(-12)).toBe(-9);
  });
});
