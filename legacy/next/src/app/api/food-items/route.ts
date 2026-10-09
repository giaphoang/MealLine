import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const { rows } = await db.query(
    "SELECT id, name, category, quantity, unit, is_in_stock AS \"isInStock\", vegan, vegetarian, gluten_free AS \"glutenFree\", halal, kosher, requires_stove AS \"requiresStove\", requires_fridge AS \"requiresFridge\" FROM food_items ORDER BY category, name"
  );
  return NextResponse.json({ foodItems: rows });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { rows } = await db.query(
    `INSERT INTO food_items (name, name_search, category, quantity, unit, vegan, vegetarian, gluten_free, halal, kosher, requires_stove, requires_fridge)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [
      body.name,
      body.name.toLowerCase().replace(/\s+/g, "-"),
      body.category ?? "general",
      body.quantity ?? 0,
      body.unit ?? "unit",
      body.vegan ?? false,
      body.vegetarian ?? false,
      body.glutenFree ?? false,
      body.halal ?? false,
      body.kosher ?? false,
      body.requiresStove ?? false,
      body.requiresFridge ?? false,
    ]
  );
  return NextResponse.json({ id: rows[0].id }, { status: 201 });
}
