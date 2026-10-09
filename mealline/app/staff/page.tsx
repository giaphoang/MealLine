import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getStaffSession, STAFF_COOKIE } from "@/lib/auth";
import { listCases } from "@/lib/cases";
import SignOutButton from "./SignOutButton";

function age(createdAt: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(createdAt).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}

export default async function StaffQueuePage() {
  const jar = await cookies();
  const staff = await getStaffSession(jar.get(STAFF_COOKIE)?.value);
  if (!staff) redirect("/staff/login");

  const cases = await listCases(staff.orgId, ["needs_review", "awaiting_followup", "approved"]);
  const groups: [string, typeof cases][] = [
    ["Needs review", cases.filter((c) => c.status === "needs_review")],
    ["Follow-up due", cases.filter((c) => c.status === "awaiting_followup")],
    ["Approved", cases.filter((c) => c.status === "approved")],
  ];

  return (
    <>
      <h1>Staff queue</h1>
      <p className="muted">
        Signed in as <strong>{staff.name}</strong> ({staff.role}). <SignOutButton />
      </p>
      {groups.map(([title, items]) => (
        <section key={title} aria-label={title}>
          <h2>{title} ({items.length})</h2>
          {items.length === 0 ? (
            <p className="muted">Nothing here.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th scope="col">Case</th><th scope="col">Age</th>
                  <th scope="col">Language</th><th scope="col">Owner</th>
                  <th scope="col">Next action</th><th scope="col">Flags</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id}>
                    <td><a href={`/staff/cases/${c.id}`} className="mono">{c.case_number}</a></td>
                    <td>{age(c.created_at)}</td>
                    <td>{c.preferred_language === "vi" ? "Vietnamese" : "English"}</td>
                    <td>{c.owner_name ?? <em className="muted">unclaimed</em>}</td>
                    <td>{c.next_action_at ? new Date(c.next_action_at).toLocaleString() : "—"}</td>
                    <td>
                      <span className={`status-pill status-${c.status}`}>{c.status.replace(/_/g, " ")}</span>
                      {c.unknowns?.length > 0 && <div className="muted">unknowns: {c.unknowns.join(", ")}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}
    </>
  );
}
