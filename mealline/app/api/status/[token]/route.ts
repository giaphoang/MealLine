import { NextRequest, NextResponse } from "next/server";
import { resolveStatusLink } from "@/lib/statusLinks";

export async function GET(
  _req: NextRequest, ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params;
  if (!token || token.length < 20) {
    return NextResponse.json({ error: "invalid_link" }, { status: 404 });
  }
  try {
    const view = await resolveStatusLink(token);
    return NextResponse.json(view);
  } catch {
    // Unauthorized link access is rejected without revealing anything.
    return NextResponse.json({ error: "invalid_or_expired_link" }, { status: 404 });
  }
}
