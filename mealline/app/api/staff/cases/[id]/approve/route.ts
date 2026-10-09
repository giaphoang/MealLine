import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/staffApi";
import { approveDelivery, markNoCapacity } from "@/lib/approval";
import { newToken } from "@/lib/ids";
import { z } from "zod";

const Body = z.object({
  optionId: z.string().min(1).max(100),
  expectedVersion: z.number().int().min(1),
  idempotencyKey: z.string().min(8).max(128).optional(),
  checks: z.object({
    serviceAreaVerified: z.boolean(),
    rulesVerified: z.boolean(),
  }),
});

export async function POST(
  req: NextRequest, ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const auth = await requireStaff(req, { mutation: true });
  if ("error" in auth) return auth.error;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const b = parsed.data;
  const result = await approveDelivery({
    caseId: id,
    optionId: b.optionId,
    expectedVersion: b.expectedVersion,
    idempotencyKey: b.idempotencyKey ?? `key_${newToken(16)}`,
    staff: {
      id: auth.staff.staffId, orgId: auth.staff.orgId,
      role: auth.staff.role, name: auth.staff.name,
    },
    checks: b.checks,
  });
  if (!result.ok) {
    const status =
      result.error === "forbidden_role" || result.error === "forbidden_org" ? 403
      : result.error === "stale_version" || result.error === "no_capacity"
        || result.error === "invalid_state" ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json(result);
}

/** Explicit no-capacity path: visible follow-up, never silent. */
const NoCapBody = z.object({ note: z.string().max(500).default("") });

export async function PUT(
  req: NextRequest, ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const auth = await requireStaff(req, { mutation: true });
  if ("error" in auth) return auth.error;
  const parsed = NoCapBody.safeParse(await req.json().catch(() => ({})));
  const r = await markNoCapacity(id, {
    id: auth.staff.staffId, orgId: auth.staff.orgId,
    role: auth.staff.role, name: auth.staff.name,
  }, parsed.success ? parsed.data.note : "");
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
  return NextResponse.json({ ok: true });
}
