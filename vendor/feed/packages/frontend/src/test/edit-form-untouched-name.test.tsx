// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FoodItemForm } from '@/components/food-item-management/form/FoodItemForm';
import { CategoryForm } from '@/components/category-management/form/CategoryForm';
import { resolveSubmittedName } from '@/lib/formatting/text';

/**
 * Regression tests: the edit forms apply Title-Case formatting at submit
 * (ISSUES.md #38). When the stored name predates the current formatting
 * rules (e.g. "Peanut butter"), reformatting an UNTOUCHED name made every
 * save look like a rename, so a limit-only edit falsely triggered the
 * Translation Management prompt. An untouched name must be submitted
 * verbatim; only an edited name is formatted.
 */

// The form's Tabs measure themselves with ResizeObserver, which jsdom lacks.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

vi.mock('@/contexts/CategoryContext', () => ({
  useCategoryContext: () => ({
    categories: [
      { id: 3, name: 'Pantry', limit: 10, limitType: 'household', icon: 'package' },
    ],
    isLoading: false,
  }),
}));

vi.mock('@/hooks/message/useMessage', () => ({
  useMessage: () => ({ showMessage: vi.fn(), showError: vi.fn() }),
}));

describe('resolveSubmittedName', () => {
  test('returns an untouched name verbatim, skipping reformatting', () => {
    expect(resolveSubmittedName('Peanut butter', 'Peanut butter')).toBe('Peanut butter');
  });

  test('formats an edited name', () => {
    expect(resolveSubmittedName('peanut butter spread', 'Peanut butter')).toBe(
      'Peanut Butter Spread'
    );
  });

  test('a name edited back to the stored value counts as untouched', () => {
    expect(resolveSubmittedName('Dry goods', 'Dry goods')).toBe('Dry goods');
  });
});

describe('FoodItemForm — untouched name is not reformatted at submit', () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    onSubmit.mockClear();
  });

  const renderForm = () =>
    render(
      <FoodItemForm
        onSubmit={onSubmit}
        initialName="Peanut butter"
        initialLimit="10"
        initialCategoryId="3"
      />
    );

  test('limit-only edit submits the stored name verbatim', async () => {
    renderForm();

    fireEvent.click(screen.getByText('Update Food Item'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Peanut butter' })
    );
  });

  test('an edited name is Title-Case formatted at submit', async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'peanut butter spread' },
    });
    fireEvent.click(screen.getByText('Update Food Item'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Peanut Butter Spread' })
    );
  });
});

describe('CategoryForm — untouched name is not reformatted at submit', () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    onSubmit.mockClear();
  });

  test('limit-only edit submits the stored name verbatim', async () => {
    render(
      <CategoryForm onSubmit={onSubmit} initialName="Dry goods" initialLimit="5" />
    );

    fireEvent.click(screen.getByText('Update Category'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Dry goods' })
    );
  });
});
