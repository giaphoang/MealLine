import { db } from "@/lib/db";
import Link from "next/link";

async function getIntakes() {
  const { rows } = await db.query(
    `SELECT id, case_number AS "caseNumber", language, phone,
            household_size AS "householdSize", dietary_avoid AS "dietaryAvoid",
            status, created_at AS "createdAt"
     FROM voice_intakes ORDER BY created_at DESC LIMIT 100`
  );
  return rows;
}

const LANG_LABEL: Record<string, string> = { en: "English", vi: "Tiếng Việt", es: "Español" };

export default async function IntakesPage() {
  const intakes = await getIntakes();

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Voice Intakes</h1>
      <p className="text-gray-600 mb-6">
        Phone calls captured by the voice system. Each intake is matched against inventory automatically.
      </p>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Case</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Language</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Household</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Dietary</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Status</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Received</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {intakes.map((intake) => (
              <tr key={intake.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/intakes/${intake.id}`} className="font-medium text-green-700 hover:underline">
                    {intake.caseNumber}
                  </Link>
                </td>
                <td className="px-4 py-3">{LANG_LABEL[intake.language] ?? intake.language}</td>
                <td className="px-4 py-3">{intake.householdSize ?? "—"}</td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {(intake.dietaryAvoid ?? []).join(", ") || "—"}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                    {intake.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {new Date(intake.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {intakes.length === 0 && (
          <p className="text-center text-gray-500 py-8">
            No intakes yet. They'll appear here when callers phone in.
          </p>
        )}
      </div>
    </div>
  );
}
