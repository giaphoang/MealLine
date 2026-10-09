import { db } from "@/lib/db";
import type { FoodItem } from "@/lib/types";

async function getItems(): Promise<FoodItem[]> {
  const { rows } = await db.query(
    `SELECT id, name, category, quantity, unit,
            is_in_stock AS "isInStock", vegan, vegetarian,
            gluten_free AS "glutenFree", halal, kosher,
            requires_stove AS "requiresStove", requires_fridge AS "requiresFridge"
     FROM food_items ORDER BY category, name`
  );
  return rows;
}

function DietBadges({ item }: { item: FoodItem }) {
  const badges: string[] = [];
  if (item.vegan) badges.push("vegan");
  if (item.vegetarian) badges.push("vegetarian");
  if (item.glutenFree) badges.push("gluten-free");
  if (item.halal) badges.push("halal");
  if (item.kosher) badges.push("kosher");
  if (badges.length === 0) return <span className="text-gray-400 text-xs">—</span>;
  return (
    <div className="flex gap-1 flex-wrap">
      {badges.map((b) => (
        <span key={b} className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
          {b}
        </span>
      ))}
    </div>
  );
}

export default async function InventoryPage() {
  const items = await getItems();

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Inventory</h1>
          <p className="text-gray-600">{items.length} items tracked</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Item</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Category</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Qty</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Dietary</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Needs</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{item.name}</td>
                <td className="px-4 py-3 text-gray-600">{item.category}</td>
                <td className="px-4 py-3">
                  {item.quantity} {item.unit}
                </td>
                <td className="px-4 py-3">
                  <DietBadges item={item} />
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {[item.requiresStove && "stove", item.requiresFridge && "fridge"]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      item.isInStock && item.quantity > 0
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {item.isInStock && item.quantity > 0 ? "In stock" : "Out"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && (
          <p className="text-center text-gray-500 py-8">
            No items yet. Add inventory to get started.
          </p>
        )}
      </div>
    </div>
  );
}
