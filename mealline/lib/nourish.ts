/**
 * Bridge from MealLine voice intake to MealLine.
 * On finalize, POSTs the captured intake to MealLine's /api/voice-intakes.
 * Config: NOURISH_API_URL and the separate NOURISH_VOICE_API_TOKEN service key.
 * If unconfigured, the bridge is a no-op (never blocks intake).
 */
import { z } from "zod";
import type { DraftFields } from "./types";

const receipt = z.object({
  intakeId: z.string().min(1),
  shoppingListId: z.number().int().positive(),
  matchedCount: z.number().int().nonnegative(),
});

export async function sendIntakeToNourish(
  draft: DraftFields,
  source: { caseId: string; caseNumber: string; language: string }
): Promise<{ intakeId: string; shoppingListId: number; matchedCount: number } | null> {
  const baseUrl = process.env.NOURISH_API_URL?.replace(/\/+$/, "");
  if (!baseUrl) return null;
  const token = process.env.NOURISH_VOICE_API_TOKEN;
  if (!token) throw new Error("nourish_service_token_missing");
  // Never send a service credential in a URL or over remote plaintext HTTP.
  try {
    const url = new URL(baseUrl);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash
      || (url.protocol !== "https:" && !(url.protocol === "http:" && local))) {
      throw new Error("invalid_url");
    }
  } catch {
    throw new Error("nourish_invalid_url");
  }
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/voice-intakes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-nourish-voice-token": token },
      redirect: "error",
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        intake: {
          id: source.caseId,
          caseNumber: source.caseNumber,
          language: source.language,
          phone: draft.contactPhone ?? null,
          addressRaw: draft.address?.raw ?? null,
          householdSize: draft.household?.size ?? null,
          dietaryAvoid: draft.dietaryAvoid ?? [],
          dietaryNotes: draft.dietaryNotes ?? null,
          hasStove: draft.equipment?.stove ?? null,
          hasFridge: draft.equipment?.fridge ?? null,
          availabilityRaw: draft.availability?.raw ?? null,
          contactPreference: draft.contactPreference ?? null,
          accommodation: draft.accommodation ?? null,
          transcript: [],
        },
      }),
    });
  } catch {
    throw new Error("nourish_unavailable");
  }
  if (!res.ok) {
    // Error bodies may contain caller data; never put them in case-event logs.
    await res.body?.cancel().catch(() => undefined);
    throw new Error(`nourish_${res.status}`);
  }
  try {
    const result = receipt.safeParse(await res.json());
    if (result.success) return result.data;
  } catch { /* Keep raw response contents out of errors and logs. */ }
  throw new Error("nourish_invalid_response");
}
