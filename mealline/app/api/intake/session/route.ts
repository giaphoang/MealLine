import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/controller";
import { demoContext, checkRateLimit, clientIp } from "@/lib/demo";

const DRAFT_COOKIE = "ml_draft";

export async function POST(req: NextRequest) {
  if (!checkRateLimit(clientIp(req.headers))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  try {
    await demoContext();
    const session = await createSession({ channel: "text" });
    const res = NextResponse.json({ sessionId: session.id });
    res.cookies.set(DRAFT_COOKIE, session.id, {
      httpOnly: true, sameSite: "lax", path: "/", maxAge: 3600,
    });
    return res;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "intake_error" }, { status: 500 }
    );
  }
}
