/**
 * Bridge from MealLine phone intake to FoodFit pantry fulfillment.
 * After a case is finalized, the voice-captured household constraints are
 * sent to FoodFit, which creates a visit and runs its deterministic basket
 * matcher against live pantry inventory. The suggested basket comes back
 * for the staff review view.
 *
 * Config: FOODFIT_BASE_URL (e.g. http://localhost:3000),
 *         FOODFIT_INTEGRATION_KEY (shared secret).
 * If unconfigured, the bridge is a no-op (logged, never blocking intake).
 */
import type { DraftFields } from "./types";

export interface FoodFitBasketLine {
  productId: string;
  productName: string;
  unit: string;
  quantity: number;
  status: string;
}

export interface FoodFitVisitResult {
  visit: { id: string; visitCode: string; allowance: number };
  basket: FoodFitBasketLine[];
  suggestionEmpty: boolean;
}

function bridgeConfig(): { baseUrl: string; key: string } | null {
  const baseUrl = process.env.FOODFIT_BASE_URL?.replace(/\/$/, "");
  const key = process.env.FOODFIT_INTEGRATION_KEY;
  if (!baseUrl || !key) return null;
  return { baseUrl, key };
}

/** Translate MealLine intake fields to FoodFit household constraints. */
export function toFoodFitConstraints(draft: DraftFields): Record<string, unknown> {
  const avoid = (draft.dietaryAvoid ?? []).map((a) => ({
    kind: "allergy" as const,
    label: a,
  }));
  return {
    householdSize: draft.household?.size ?? null,
    equipment: {
      stove: draft.equipment?.stove ?? null,
      fridge: draft.equipment?.fridge ?? null,
    },
    fridge: draft.equipment?.fridge == null ? "unknown" : draft.equipment.fridge ? "yes" : "no",
    freezer: "unknown",
    water: "unknown",
    easyOpenNeeded: "unknown",
    preferences: [],
    avoid,
  };
}

export async function createFoodFitVisit(
  draft: DraftFields,
  source: { caseId: string; caseNumber: string }
): Promise<FoodFitVisitResult | null> {
  const cfg = bridgeConfig();
  if (!cfg) return null;
  const res = await fetch(`${cfg.baseUrl}/api/integration/phone-intake`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-integration-key": cfg.key,
    },
    body: JSON.stringify({
      constraints: toFoodFitConstraints(draft),
      source: { system: "mealline", caseId: source.caseId, caseNumber: source.caseNumber },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`foodfit_bridge_${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as FoodFitVisitResult;
}
