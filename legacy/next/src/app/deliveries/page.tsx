import { db } from "@/lib/db";

async function getDeliveries() {
  const { rows } = await db.query(
    `SELECT d.id, d.status, d.scheduled_for AS "scheduledFor", d.notes,
            sl.title AS "listTitle", vi.case_number AS "caseNumber"
     FROM deliveries d
     LEFT JOIN shopping_lists sl ON sl.id = d.shopping_list_id
     LEFT JOIN voice_intakes vi ON vi.id = d.intake_id
     ORDER BY d.created_at DESC LIMIT 100`
  );
  return rows;
}

export default async function DeliveriesPage() {
  const deliveries = await getDeliveries();

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Deliveries</h1>
      <p className="text-gray-600 mb-6">
        Track approved shopping lists through to delivery.
      </p>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">List</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Case</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Status</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Scheduled</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {deliveries.map((d: any) => (
              <tr key={d.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{d.listTitle ?? "—"}</td>
                <td className="px-4 py-3">{d.caseNumber ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                    {d.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {d.scheduledFor ? new Date(d.scheduledFor).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {deliveries.length === 0 && (
          <p className="text-center text-gray-500 py-8">
            No deliveries yet. Approve a shopping list to create one.
          </p>
        )}
      </div>
    </div>
  );
}
