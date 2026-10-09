/**
 * Bridge from MealLine voice intake to FEED pantry system.
 *
 * Takes the voice-captured household data, applies dietary/equipment-aware
 * matching against FEED's inventory, and creates a shopping list in FEED
 * so staff see it in FEED's interface.
 *
 * Config: FEED_API_URL (e.g. http://localhost:3001),
 *         FEED_API_TOKEN (JWT service account token).
 * If unconfigured, the bridge is a no-op (never blocks intake).
 */
import type { DraftFields } from "./types";

interface FeedFoodItem {
  id: number;
  name: string;
  categoryId: number;
  vegan: boolean;
  vegetarian: boolean;
  glutenFree: boolean;
  halal: boolean;
  kosher: boolean;
  isInStock: boolean;
  limit: number;
}

interface FeedShoppingListResult {
  instance: { id: number; title: string };
}

function feedConfig(): { baseUrl: string; token: string } | null {
  const baseUrl = process.env.FEED_API_URL?.replace(/\/$/, "");
  const token = process.env.FEED_API_TOKEN;
  if (!baseUrl || !token) return null;
  return { baseUrl, token };
}

async function feedFetch(
  cfg: { baseUrl: string; token: string },
  path: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
  });
}

/**
 * Apply our business logic: filter FEED inventory by dietary needs,
 * equipment, and scale by household size.
 */
export function matchItemsForHousehold(
  items: FeedFoodItem[],
  draft: DraftFields
): FeedFoodItem[] {
  const avoid = (draft.dietaryAvoid ?? []).map((a) => a.toLowerCase());
  const hasStove = draft.equipment?.stove ?? true;
  const hasFridge = draft.equipment?.fridge ?? true;

  return items.filter((item) => {
    if (!item.isInStock) return false;

    // Dietary filters
    const nameLower = item.name.toLowerCase();
    for (const a of avoid) {
      if (a.includes("peanut") && nameLower.includes("peanut")) return false;
      if (a.includes("dairy") && nameLower.includes("dairy")) return false;
      if (a.includes("pork") && nameLower.includes("pork")) return false;
      if (a.includes("shellfish") && /shrimp|shellfish|crab|lobster/i.test(nameLower)) return false;
      if (a.includes("gluten") && !item.glutenFree) return false;
      if (a.includes("soy") && nameLower.includes("soy")) return false;
      if (a.includes("egg") && nameLower.includes("egg")) return false;
    }
    if (avoid.includes("meat") && !item.vegetarian) return false;
    if (avoid.includes("vegan") && !item.vegan) return false;

    // Equipment filters
    if (!hasStove && /frozen.*meal|uncooked/i.test(nameLower)) return false;
    if (!hasFridge && /dairy|milk|yogurt|cheese/i.test(nameLower)) return false;

    return true;
  });
}

/**
 * Build a FEED shopping list from matched items.
 * Uses FEED's persist-only generation path.
 */
export async function createFeedShoppingList(
  draft: DraftFields,
  source: { caseId: string; caseNumber: string }
): Promise<FeedShoppingListResult | null> {
  const cfg = feedConfig();
  if (!cfg) return null;

  const invRes = await feedFetch(cfg, "/api/food-items");
  if (!invRes.ok) {
    throw new Error(`feed_inventory_${invRes.status}`);
  }
  const { foodItems } = (await invRes.json()) as { foodItems: FeedFoodItem[] };

  const matched = matchItemsForHousehold(foodItems, draft);
  const householdSize = draft.household?.size ?? 1;

  const generatedData = {
    sections: [
      {
        title: `Household of ${householdSize} — Voice Intake ${source.caseNumber}`,
        items: matched.slice(0, 20).map((item) => ({
          foodItemId: item.id,
          name: item.name,
          quantity: Math.min(item.limit, Math.ceil(householdSize / 2)),
          notes: draft.dietaryAvoid?.length
            ? `Avoids: ${draft.dietaryAvoid.join(", ")}`
            : undefined,
        })),
      },
    ],
    metadata: {
      source: "mealline_voice",
      caseId: source.caseId,
      caseNumber: source.caseNumber,
      householdSize,
      dietaryAvoid: draft.dietaryAvoid ?? [],
      equipment: draft.equipment ?? {},
      generatedAt: new Date().toISOString(),
    },
  };

  const createRes = await feedFetch(cfg, "/api/shopping-lists/generate", {
    method: "POST",
    body: JSON.stringify({
      templateId: 1,
      title: `Voice Intake ${source.caseNumber} — Household of ${householdSize}`,
      generatedData,
      generatedBy: "mealline_voice_bridge",
    }),
  });
  if (!createRes.ok) {
    const text = await createRes.text().catch(() => "");
    throw new Error(`feed_shopping_list_${createRes.status}: ${text.slice(0, 200)}`);
  }
  return (await createRes.json()) as FeedShoppingListResult;
}
