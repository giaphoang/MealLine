import { db } from "@/lib/db";

async function getLists() {
  const { rows } = await db.query(
    `SELECT sl.id, sl.title, sl.status, sl.items, sl.created_at AS "createdAt",
            vi.case_number AS "caseNumber"
     FROM shopping_lists sl
     LEFT JOIN voice_intakes vi ON vi.id = sl.intake_id
     ORDER BY sl.created_at DESC LIMIT 100`
  );
  return rows;
}

export default async function ShoppingListsPage() {
  const lists = await getLists();

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Shopping Lists</h1>
      <p className="text-gray-600 mb-6">
        Auto-generated from voice intakes. Review, adjust, and approve.
      </p>

      <div className="space-y-4">
        {lists.map((list: any) => (
          <div key={list.id} className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-semibold text-lg">{list.title}</h3>
                {list.caseNumber && (
                  <p className="text-sm text-gray-500">From intake {list.caseNumber}</p>
                )}
              </div>
              <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">
                {list.status}
              </span>
            </div>
            <ul className="space-y-1">
              {(list.items ?? []).map((item: any, i: number) => (
                <li key={i} className="text-sm flex justify-between py-1 border-b border-gray-100">
                  <span>{item.name}</span>
                  <span className="text-gray-600">
                    {item.quantity} {item.unit}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {lists.length === 0 && (
          <p className="text-center text-gray-500 py-8 bg-white rounded-lg border border-gray-200">
            No shopping lists yet. They generate automatically from voice intakes.
          </p>
        )}
      </div>
    </div>
  );
}
