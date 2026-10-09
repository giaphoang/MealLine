// Run after ./setup.sh with the app running on port 3003.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db.ts";

const baseUrl = process.env.NOURISH_BASE_URL ?? "http://127.0.0.1:3003";
const caseNumber = `nourish-smoke-${randomUUID()}`;
const transcript = [{
  step: "diet",
  input: "vegan, no peanuts",
  reply: "Recorded",
  at: new Date().toISOString(),
}];

async function submitIntake(body) {
  const response = await fetch(`${baseUrl}/api/voice-intakes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 201, "Intake submission should succeed");
  return response.json();
}

try {
  for (const route of ["/", "/inventory", "/intakes", "/shopping-lists", "/deliveries"]) {
    const response = await fetch(`${baseUrl}${route}`);
    assert.equal(response.status, 200, `${route} should render`);
    const html = await response.text();
    if (route === "/") {
      const cssPath = html.match(/href="([^"]+\.css[^"]*)"/)?.[1];
      assert.ok(cssPath, "Dashboard should include generated CSS");
      const cssResponse = await fetch(new URL(cssPath, baseUrl));
      assert.equal(cssResponse.status, 200);
      const css = await cssResponse.text();
      assert.match(css, /\.bg-green-100/);
      assert.match(css, /\.flex\s*\{/);
    }
    console.log(`PASS ${route}`);
  }

  const inventory = await fetch(`${baseUrl}/api/food-items`);
  assert.equal(inventory.status, 200);
  const { foodItems } = await inventory.json();
  assert.ok(foodItems.some((item) => item.name === "Rice"), "Setup should seed inventory");

  const invalid = await fetch(`${baseUrl}/api/voice-intakes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ intake: {} }),
  });
  assert.equal(invalid.status, 400);

  const payload = {
    intake: {
      caseNumber,
      language: "en",
      householdSize: 4,
      dietaryAvoid: ["vegan", "peanuts"],
      hasStove: true,
      hasFridge: true,
    },
    transcript,
  };
  const result = await submitIntake(payload);
  assert.ok(result.items.length > 0, "Seed inventory should produce a shopping list");
  for (const item of result.items) {
    const foodItem = foodItems.find((food) => food.id === item.foodItemId);
    assert.ok(foodItem?.vegan, "Vegan intake must only receive vegan inventory");
    assert.doesNotMatch(item.name, /peanut/i);
    assert.equal(item.quantity, Math.min(foodItem.quantity, 2));
  }

  const { rows: stored } = await db.query(
    "SELECT vi.id, vi.transcript, sl.id AS list_id FROM voice_intakes vi JOIN shopping_lists sl ON sl.intake_id = vi.id WHERE vi.case_number = $1",
    [caseNumber]
  );
  assert.equal(stored.length, 1);
  assert.equal(stored[0].id, result.intakeId);
  assert.equal(stored[0].list_id, result.shoppingListId);
  assert.deepEqual(stored[0].transcript, transcript);
  console.log("PASS dietary matching, persisted shopping list, and top-level transcript");

  for (const route of ["/intakes", "/shopping-lists"]) {
    const response = await fetch(`${baseUrl}${route}`);
    assert.ok((await response.text()).includes(caseNumber), "Pages should reflect new records immediately");
  }
  console.log("PASS pages reflect newly created records");

  const repeated = await submitIntake(payload);
  assert.equal(repeated.intakeId, result.intakeId, "Repeated case number must reuse its stored ID");
  const { rows: repeatedLists } = await db.query(
    "SELECT intake_id FROM shopping_lists WHERE id = $1",
    [repeated.shoppingListId]
  );
  assert.equal(repeatedLists[0].intake_id, result.intakeId);
  console.log("PASS repeated intake uses the existing ID");

  const nestedTranscript = [{ ...transcript[0], input: "Legacy transcript format" }];
  await submitIntake({ intake: { ...payload.intake, transcript: nestedTranscript } });
  const { rows: legacy } = await db.query(
    "SELECT transcript FROM voice_intakes WHERE case_number = $1",
    [caseNumber]
  );
  assert.deepEqual(legacy[0].transcript, nestedTranscript);
  console.log("PASS nested transcript compatibility");
} finally {
  try {
    // Remove only the records created with this run's unique case number.
    await db.query("DELETE FROM shopping_lists WHERE intake_id IN (SELECT id FROM voice_intakes WHERE case_number = $1)", [caseNumber]);
    await db.query("DELETE FROM voice_intakes WHERE case_number = $1", [caseNumber]);
  } finally {
    await db.close();
  }
}
