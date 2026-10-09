// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FoodItemManagement } from '@/components/food-item-management';
import type { FoodItem, StatusFlags, DietaryFlags } from '@/types/food-item';

/**
 * Regression test: the Edit Food Item dialog's translation-management step
 * ("Keep Current Translations" vs "Replace Translations") passes a
 * `keepTranslations` boolean through `onSave`, but `handleSaveEdit` used to
 * rebuild the `updateFoodItem` payload without it. The backend deletes the
 * old translations on rename whenever `keepTranslations` is falsy, so the
 * user's "Keep" choice was silently ignored and translations were deleted.
 *
 * These tests drive the real EditDialog (its translation-confirm step is the
 * feature under test) through the real page handler and assert the flag
 * reaches the context's updateFoodItem.
 */

const statusFlags: StatusFlags = { isInStock: true, isLimited: false, isClearance: false };
const dietaryFlags: DietaryFlags = {
  vegan: false,
  vegetarian: false,
  glutenFree: false,
  organic: false,
  halal: false,
  kosher: false,
  readyToEat: false,
};

const existingItem: FoodItem = {
  id: 7,
  name: 'Tuna',
  categoryId: 3,
  limit: 2,
  limitType: 'household',
  statusFlags,
  dietaryFlags,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const updateFoodItem = vi.fn().mockResolvedValue(existingItem);

vi.mock('@/contexts/FoodItemContext', () => ({
  useFoodItemContext: () => ({
    foodItems: [existingItem],
    isLoading: false,
    isSaving: false,
    error: null,
    refreshFoodItems: vi.fn().mockResolvedValue(undefined),
    createFoodItem: vi.fn(),
    updateFoodItem,
    deleteFoodItem: vi.fn(),
    bulkUpdateFoodItems: vi.fn(),
    bulkDeleteFoodItems: vi.fn(),
  }),
}));

vi.mock('@/hooks/message/useMessage', () => ({
  useMessage: () => ({ showMessage: vi.fn(), showError: vi.fn() }),
}));

// The list and sibling dialogs are not under test; stub them so the page
// renders without table/category plumbing. The list stub exposes a button
// that opens the edit dialog for the first item, as the row action would.
vi.mock('@/components/food-item-management/FoodItemList', () => ({
  FoodItemList: ({ foodItems, onEdit }: { foodItems: FoodItem[]; onEdit: (item: FoodItem) => void }) => (
    <button onClick={() => onEdit(foodItems[0])}>edit-first-item</button>
  ),
}));
vi.mock('@/components/food-item-management/delete-dialog', () => ({
  DeleteDialog: () => null,
}));
vi.mock('@/components/food-item-management/add-dialog', () => ({
  AddFoodItemDialog: () => null,
}));
vi.mock('@/components/shared/bulk-delete-dialog', () => ({
  BulkDeleteDialog: () => null,
}));

// The form's internals (radix selects, category context) are not under test;
// stub it with a submit button that renames the item, which is what routes
// the dialog into the translation-management step.
vi.mock('@/components/food-item-management/form/FoodItemForm', () => ({
  FoodItemForm: ({ onSubmit }: { onSubmit: (data: unknown) => Promise<void> }) => (
    <button
      onClick={() =>
        onSubmit({
          name: 'Albacore Tuna',
          limit: 2,
          limitType: 'household',
          categoryId: 3,
          statusFlags,
          dietaryFlags,
        })
      }
    >
      submit-rename
    </button>
  ),
}));

async function renameAndReachTranslationStep() {
  render(<FoodItemManagement />);
  fireEvent.click(screen.getByText('edit-first-item'));
  fireEvent.click(await screen.findByText('submit-rename'));
  await screen.findByText('Translation Management');
}

describe('Edit Food Item — keepTranslations reaches updateFoodItem', () => {
  beforeEach(() => {
    updateFoodItem.mockClear();
  });

  test('"Keep Current Translations" sends keepTranslations: true', async () => {
    await renameAndReachTranslationStep();

    fireEvent.click(screen.getByText('Keep Current Translations'));

    await waitFor(() => expect(updateFoodItem).toHaveBeenCalledTimes(1));
    expect(updateFoodItem).toHaveBeenCalledWith(
      expect.objectContaining({
        id: existingItem.id,
        name: 'Albacore Tuna',
        keepTranslations: true,
      })
    );
  });

  test('"Replace Translations" sends keepTranslations: false', async () => {
    await renameAndReachTranslationStep();

    fireEvent.click(screen.getByText('Replace Translations'));

    await waitFor(() => expect(updateFoodItem).toHaveBeenCalledTimes(1));
    expect(updateFoodItem).toHaveBeenCalledWith(
      expect.objectContaining({
        id: existingItem.id,
        name: 'Albacore Tuna',
        keepTranslations: false,
      })
    );
  });
});
