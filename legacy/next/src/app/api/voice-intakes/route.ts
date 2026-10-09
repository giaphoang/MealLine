import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { matchItemsForIntake, buildShoppingListItems } from "@/lib/matcher";

/**
 * Voice intake ingestion endpoint.
 * MealLine calls this on finalize with the captured intake data.
 * Creates the intake, runs matching, generates a shopping list.
 *
 * POST body: { intake: VoiceIntake fields, transcript: [...] }
 */
export async function POST(req: Request) {
  const body = await req.json();
  const intake = body.intake;
  if (!intake?.caseNumber) {
    return NextResponse.json({ error: "caseNumber required" }, { status: 400 });
  }

  const candidateId = intake.id ?? `vi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // 1. Store the intake
  const { rows: intakeRows } = await db.query(
    `INSERT INTO voice_intakes
     (id, case_number, language, phone, address_raw, household_size, dietary_avoid, dietary_notes,
      has_stove, has_fridge, availability_raw, contact_preference, accommodation, transcript, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'matched')
     ON CONFLICT (case_number) DO UPDATE SET
       updated_at = now(), transcript = EXCLUDED.transcript
     RETURNING id`,
    [
      candidateId,
      intake.caseNumber,
      intake.language ?? "en",
      intake.phone ?? null,
      intake.addressRaw ?? null,
      intake.householdSize ?? null,
      intake.dietaryAvoid ?? [],
      intake.dietaryNotes ?? null,
      intake.hasStove ?? null,
      intake.hasFridge ?? null,
      intake.availabilityRaw ?? null,
      intake.contactPreference ?? null,
      intake.accommodation ?? null,
      JSON.stringify(body.transcript ?? intake.transcript ?? []),
    ]
  );
  const id = intakeRows[0].id;

  // 2. Run matching against inventory
  const { rows: items } = await db.query(
    `SELECT id, name, category, quantity, unit,
            is_in_stock AS "isInStock", vegan, vegetarian,
            gluten_free AS "glutenFree", halal, kosher,
            requires_stove AS "requiresStove", requires_fridge AS "requiresFridge"
     FROM food_items WHERE is_in_stock = true AND quantity > 0`
  );
  const matched = matchItemsForIntake(items, {
    dietaryAvoid: intake.dietaryAvoid ?? [],
    hasStove: intake.hasStove ?? null,
    hasFridge: intake.hasFridge ?? null,
    householdSize: intake.householdSize ?? null,
  });
  const listItems = buildShoppingListItems(
    matched,
    intake.householdSize ?? null,
    intake.dietaryAvoid ?? []
  );

  // 3. Create shopping list
  const { rows: listRows } = await db.query(
    `INSERT INTO shopping_lists (intake_id, title, status, items)
     VALUES ($1, $2, 'draft', $3) RETURNING id`,
    [
      id,
      `Voice ${intake.caseNumber} — Household of ${intake.householdSize ?? "?"}`,
      JSON.stringify(listItems),
    ]
  );

  return NextResponse.json(
    {
      intakeId: id,
      shoppingListId: listRows[0].id,
      matchedCount: matched.length,
      items: listItems,
    },
    { status: 201 }
  );
}

export async function GET() {
  const { rows } = await db.query(
    `SELECT id, case_number AS "caseNumber", language, phone,
            household_size AS "householdSize", dietary_avoid AS "dietaryAvoid",
            status, created_at AS "createdAt"
     FROM voice_intakes ORDER BY created_at DESC LIMIT 100`
  );
  return NextResponse.json({ intakes: rows });
}
