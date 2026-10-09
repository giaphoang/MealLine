import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/staffApi";
import { getCaseForOrg, getEvents, getRequest, listDeliveryOptions } from "@/lib/cases";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest, ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const auth = await requireStaff(_req);
  if ("error" in auth) return auth.error;

  const c = await getCaseForOrg(id, auth.staff.orgId);
  if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [events, request, options] = await Promise.all([
    getEvents(id),
    getRequest(c.request_id),
    listDeliveryOptions(id).catch(() => []),
  ]);
  const proposals = await db().query(
    `SELECT p.*, o.label AS option_label FROM delivery_proposals p
     JOIN delivery_options o ON o.id = p.option_id
     WHERE p.case_id = $1 ORDER BY p.created_at DESC`, [id]
  );
  const bookings = await db().query(
    `SELECT b.*, o.label AS option_label, o.window_start, o.window_end
     FROM bookings b JOIN delivery_options o ON o.id = b.option_id
     WHERE b.case_id = $1 ORDER BY b.created_at DESC`, [id]
  );
  const attempts = await db().query(
    `SELECT na.* FROM notification_attempts na
     JOIN outbox_jobs j ON j.id = na.job_id
     WHERE j.case_id = $1 ORDER BY na.created_at DESC`, [id]
  );

  return NextResponse.json({
    kase: {
      id: c.id, caseNumber: c.case_number, type: c.type, status: c.status,
      version: c.version, language: c.preferred_language,
      contactPreference: c.contact_preference,
      accommodation: c.accommodation_request,
      confirmedFields: c.confirmed_fields,
      unknowns: c.unknowns,
      ruleCheck: c.rule_check_result,
      originalInput: c.original_input,
      nextActionAt: c.next_action_at,
      verificationStatus: c.verification_status,
      createdAt: c.created_at, updatedAt: c.updated_at,
    },
    request: request ? {
      channel: request.channel, address: request.address,
      household: request.household, availability: request.availability,
      contactName: request.contact_name,
      // Contact phone shown to staff only; never in applicant status view.
      contactPhone: request.contact_phone,
    } : null,
    options: options.map((o) => ({
      id: o.id, label: o.label, windowStart: o.window_start, windowEnd: o.window_end,
      remaining: o.capacity_total - o.capacity_reserved,
      capacityTotal: o.capacity_total, note: o.note,
    })),
    proposals: proposals.rows,
    bookings: bookings.rows,
    notificationAttempts: attempts.rows,
    events,
    canApprove: auth.staff.role === "coordinator",
    demoLabel: "Demo provider (synthetic) — no real pantry integration",
  });
}
