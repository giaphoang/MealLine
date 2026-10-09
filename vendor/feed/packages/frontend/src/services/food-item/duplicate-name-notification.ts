// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { FoodItem } from '@/types/food-item';
import { messageService } from '@/services/message';
import { ApiError } from '../base';
import { FoodItemService } from './index';

/**
 * Shared, page-agnostic handling for the "food item name already exists"
 * error returned when staff create a food item.
 *
 * The same Add New Item dialog is used by Food Item Management AND the
 * Shopping List Builder, so this notification logic lives at the service
 * level rather than in any one page. A very common staff workflow is to
 * re-enter an item that already exists but is hidden from their inventory
 * view by an "in stock" filter; when the backend reports the duplicate it
 * also returns the existing item, and -- if that item is out of stock --
 * the error toast offers a one-click "Mark In Stock" action so staff do
 * not have to hunt the item down and change its status manually.
 *
 * Backend contract: `POST /food-items` returns HTTP 400 with body
 * `{ error: { message, code: 'DUPLICATE_FOOD_ITEM_NAME', existingItem } }`
 * on a unique-name conflict (see `packages/backend/src/routes/food-items.ts`).
 */

const DUPLICATE_CODE = 'DUPLICATE_FOOD_ITEM_NAME';
const DUPLICATE_MESSAGE =
  'A food item with this name already exists. Please choose a different name.';

const foodItemService = new FoodItemService();

/**
 * True when `error` is the structured duplicate-food-item-name conflict.
 * The food-item data hook uses this to suppress its generic error toast so
 * that {@link notifyFoodItemCreateError} can own this notification instead.
 */
export function isDuplicateFoodItemNameError(error: unknown): boolean {
  return error instanceof ApiError && error.code === DUPLICATE_CODE;
}

/** Pulls the existing item out of the conflict payload, when present. */
function getExistingItem(error: unknown): FoodItem | null {
  if (!(error instanceof ApiError) || error.code !== DUPLICATE_CODE) return null;
  const existing = (error.details as { existingItem?: FoodItem } | undefined)?.existingItem;
  return existing && typeof existing.id === 'number' ? existing : null;
}

export interface FoodItemCreateErrorOptions {
  /**
   * Invoked after the existing item is successfully marked back in stock,
   * so the calling page can refresh its own view (the inventory list, the
   * builder's inventory sections + canvas, etc.).
   */
  onMarkedInStock?: () => void | Promise<void>;
}

/**
 * Shows the appropriate toast for a failed food-item creation.
 *
 * Only the duplicate-name conflict is handled here: any other error is
 * already surfaced by the generic `ErrorHandlerService` path inside the
 * food-item data hook, so this helper deliberately does nothing for it
 * (returns `false`). Callers should invoke this from their create-item
 * `catch` block; it is safe to call for every error.
 *
 * @returns `true` when the error was a duplicate-name conflict handled here.
 */
export function notifyFoodItemCreateError(
  error: unknown,
  options: FoodItemCreateErrorOptions = {},
): boolean {
  if (!isDuplicateFoodItemNameError(error)) return false;

  const existing = getExistingItem(error);

  // No existing item in the payload (a rare race) or it is already in
  // stock -> a plain duplicate-name error; a "Mark In Stock" action would
  // be a no-op, so just report the conflict.
  if (!existing || existing.statusFlags.isInStock) {
    messageService.error(DUPLICATE_MESSAGE);
    return true;
  }

  // The existing item is out of stock -- the common "hidden by my filter"
  // case. Offer a one-click shortcut to bring it back in stock.
  messageService.error(DUPLICATE_MESSAGE, {
    persist: true,
    action: {
      label: 'Mark In Stock',
      onClick: () => {
        void markExistingItemInStock(existing, options.onMarkedInStock);
      },
    },
  });
  return true;
}

/** Marks the existing item in stock, then lets the caller refresh its view. */
async function markExistingItemInStock(
  item: FoodItem,
  onMarkedInStock?: () => void | Promise<void>,
): Promise<void> {
  try {
    await foodItemService.updateFoodItem({
      id: item.id,
      name: item.name,
      limit: item.limit,
      categoryId: item.categoryId,
      statusFlags: { ...item.statusFlags, isInStock: true },
      dietaryFlags: item.dietaryFlags,
    });
    messageService.success(`${item.name} marked in stock.`);
    await onMarkedInStock?.();
  } catch (err) {
    messageService.error(
      err instanceof Error && err.message
        ? `Could not mark ${item.name} in stock: ${err.message}`
        : `Could not mark ${item.name} in stock. Please try again.`,
    );
  }
}
