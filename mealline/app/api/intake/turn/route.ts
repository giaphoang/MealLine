import { NextRequest, NextResponse } from "next/server";
import { processTurn } from "@/lib/controller";
import { demoContext, checkRateLimit, clientIp } from "@/lib/demo";
import { z } from "zod";

const DRAFT_COOKIE = "ml_draft";
const Body = z.object({ input: z.string().max(2000).nullish() });

export async function POST(req: NextRequest) {
  if (!checkRateLimit(clientIp(req.headers))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const sessionId = req.cookies.get(DRAFT_COOKIE)?.value;
  if (!sessionId) {
    return NextResponse.json({ error: "no_draft_session" }, { status: 400 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  try {
    const ctx = await demoContext();
    const result = await processTurn(sessionId, parsed.data.input ?? null, {
      orgId: ctx.orgId, providerId: ctx.providerId,
      publicBaseUrl: process.env.PUBLIC_BASE_URL,
    });
    return NextResponse.json({
      step: result.session.step,
      language: result.session.language,
      reply: result.reply,
      done: result.done,
      handoff: result.handoff,
      caseNumber: result.caseNumber,
      statusLinkPath: result.statusLinkPath,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "intake_error";
    const status = msg === "session_not_found" ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
