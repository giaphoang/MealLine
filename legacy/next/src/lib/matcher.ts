/**
 * Dietary/equipment-aware matching logic.
 * Ported from FoodFit's deterministic matcher + MealLine's FEED bridge.
 * Pure function — no DB, no side effects, fully testable.
 */
import type { FoodItem, VoiceIntake, ShoppingListItem } from "./types";

export interface MatchOptions {
  maxItems?: number;
}

export function matchItemsForIntake(
  items: FoodItem[],
  intake: Pick<VoiceIntake, "dietaryAvoid" | "hasStove" | "hasFridge" | "householdSize">,
  opts: MatchOptions = {}
): FoodItem[] {
  const maxItems = opts.maxItems ?? 20;
  const avoid = (intake.dietaryAvoid ?? []).map((a) => a.toLowerCase());
  const hasStove = intake.hasStove ?? true;
  const hasFridge = intake.hasFridge ?? true;

  const matched = items.filter((item) => {
    if (!item.isInStock || item.quantity <= 0) return false;

    const nameLower = item.name.toLowerCase();

    // Dietary filters — explicit avoidances
    for (const a of avoid) {
      if (a.includes("peanut") && nameLower.includes("peanut")) return false;
      if (a.includes("dairy") && (nameLower.includes("dairy") || nameLower.includes("milk"))) return false;
      if (a.includes("pork") && nameLower.includes("pork")) return false;
      if (a.includes("shellfish") && /shrimp|shellfish|crab|lobster/i.test(nameLower)) return false;
      if (a.includes("gluten") && !item.glutenFree) return false;
      if (a.includes("soy") && nameLower.includes("soy")) return false;
      if (a.includes("egg") && nameLower.includes("egg")) return false;
      if (a.includes("nut") && /nut|almond|walnut|cashew/i.test(nameLower)) return false;
    }
    // Diet patterns
    if (avoid.some((a) => a.includes("vegetarian")) && !item.vegetarian) return false;
    if (avoid.some((a) => a.includes("vegan")) && !item.vegan) return false;
    if (avoid.some((a) => a.includes("halal")) && !item.halal) return false;
    if (avoid.some((a) => a.includes("kosher")) && !item.kosher) return false;

    // Equipment filters
    if (!hasStove && item.requiresStove) return false;
    if (!hasFridge && item.requiresFridge) return false;

    return true;
  });

  return matched.slice(0, maxItems);
}

export function buildShoppingListItems(
  matched: FoodItem[],
  householdSize: number | null,
  dietaryAvoid: string[]
): ShoppingListItem[] {
  const size = householdSize ?? 1;
  return matched.map((item) => ({
    foodItemId: item.id,
    name: item.name,
    quantity: Math.min(item.quantity, Math.max(1, Math.ceil(size / 2))),
    unit: item.unit,
    notes: dietaryAvoid.length > 0 ? `Avoids: ${dietaryAvoid.join(", ")}` : undefined,
  }));
}
