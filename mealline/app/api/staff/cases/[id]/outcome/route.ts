import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/staffApi";
import { recordOutcome } from "@/lib/cases";
import { z } from "zod";

const Body = z.object({
  outcome: z.enum(["fulfilled", "closed_without_service", "cancelled"]),
  reason: z.string().max(500).optional(),
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
  try {
    const c = await recordOutcome(
      id, parsed.data.outcome, auth.staff.staffId, auth.staff.orgId, parsed.data.reason
    );
    return NextResponse.json({ ok: true, status: c.status });
  } catch {
    return NextResponse.json({ error: "invalid_state_or_forbidden" }, { status: 409 });
  }
}
