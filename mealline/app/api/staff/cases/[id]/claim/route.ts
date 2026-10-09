import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/staffApi";
import { claimCase } from "@/lib/cases";

export async function POST(
  req: NextRequest, ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const auth = await requireStaff(req, { mutation: true });
  if ("error" in auth) return auth.error;
  try {
    const c = await claimCase(id, auth.staff.staffId, auth.staff.orgId);
    return NextResponse.json({ ok: true, owner: auth.staff.name, version: c.version });
  } catch {
    return NextResponse.json({ error: "not_found_or_forbidden" }, { status: 404 });
  }
}
