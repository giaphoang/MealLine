import { db } from "@/lib/db";

async function getStats() {
  const [intakes, items, lists, deliveries] = await Promise.all([
    db.query("SELECT COUNT(*) AS c, COUNT(*) FILTER (WHERE status = 'pending') AS pending FROM voice_intakes"),
    db.query("SELECT COUNT(*) AS c, SUM(quantity) AS units FROM food_items WHERE is_in_stock = true"),
    db.query("SELECT COUNT(*) AS c FROM shopping_lists WHERE status = 'draft'"),
    db.query("SELECT COUNT(*) AS c, COUNT(*) FILTER (WHERE status = 'pending') AS pending FROM deliveries"),
  ]);
  return {
    intakes: intakes.rows[0],
    items: items.rows[0],
    lists: lists.rows[0],
    deliveries: deliveries.rows[0],
  };
}

export default async function Dashboard() {
  const stats = await getStats();

  const cards = [
    { label: "Voice Intakes", value: stats.intakes.c, sub: `${stats.intakes.pending} pending`, href: "/intakes" },
    { label: "Items in Stock", value: stats.items.c, sub: `${stats.items.units ?? 0} units`, href: "/inventory" },
    { label: "Draft Shopping Lists", value: stats.lists.c, sub: "awaiting review", href: "/shopping-lists" },
    { label: "Deliveries", value: stats.deliveries.c, sub: `${stats.deliveries.pending} pending`, href: "/deliveries" },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
      <p className="text-gray-600 mb-8">
        Unified food access operations — voice intakes, inventory, and deliveries.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <a
            key={card.label}
            href={card.href}
            className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow"
          >
            <p className="text-sm text-gray-500 mb-1">{card.label}</p>
            <p className="text-3xl font-bold text-gray-900">{card.value}</p>
            <p className="text-sm text-gray-500 mt-1">{card.sub}</p>
          </a>
        ))}
      </div>

      <div className="mt-8 bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">How it works</h2>
        <ol className="space-y-3 text-gray-700">
          <li className="flex gap-3">
            <span className="font-bold text-green-700">1.</span>
            <span><strong>Voice intake:</strong> Caller dials in — the phone system captures household size, dietary needs, equipment, and address in English, Spanish, or Vietnamese.</span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold text-green-700">2.</span>
            <span><strong>Smart matching:</strong> The intake is matched against live pantry inventory — filtering by allergies, diet, and kitchen equipment.</span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold text-green-700">3.</span>
            <span><strong>Staff review:</strong> A shopping list is generated. Staff review, adjust, and approve it here.</span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold text-green-700">4.</span>
            <span><strong>Delivery:</strong> Approved lists become delivery tasks, assigned to volunteers and tracked to completion.</span>
          </li>
        </ol>
      </div>
    </div>
  );
}
