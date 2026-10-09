import { NextRequest, NextResponse } from "next/server";
import { createSession, processTurn } from "@/lib/controller";
import { demoContext, checkRateLimit, clientIp } from "@/lib/demo";

/**
 * Text simulator: reproducible backend tests, SEPARATELY LABELED from real
 * telephone integration. Same conversation controller, no phone network.
 */

export async function POST(req: NextRequest) {
  if (!checkRateLimit(clientIp(req.headers))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const { sessionId, input } = body as { sessionId?: string; input?: string };

  try {
    const ctx = await demoContext();
    let sid = sessionId;
    if (!sid) {
      const s = await createSession({ channel: "sim" });
      sid = s.id;
    }
    const result = await processTurn(sid, input ?? null, {
      orgId: ctx.orgId, providerId: ctx.providerId,
    });
    return NextResponse.json({
      simulated: true,
      label: "SIMULATED conversation (not a real phone call)",
      sessionId: result.session.id,
      step: result.session.step,
      language: result.session.language,
      reply: result.reply,
      done: result.done,
      handoff: result.handoff,
      caseId: result.caseId,
      caseNumber: result.caseNumber,
      statusLinkPath: result.statusLinkPath,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "sim_error" }, { status: 500 }
    );
  }
}
