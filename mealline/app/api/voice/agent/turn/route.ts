import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AgentError, authenticatedAgentSession, pipecatModel, streamingLanguage, withAgentSessionLock } from "@/lib/agent";
import { getSession, processTurn } from "@/lib/controller";
import { demoContext } from "@/lib/demo";
import { INTAKE_STEPS } from "@/lib/types";
import { inTransaction } from '@/lib/db';
import { phoneDigitCount, protectedPhoneInput } from '@/lib/phoneFlow';

const Body = z.object({ requestId: z.string().uuid(), expectedStep: z.enum(INTAKE_STEPS),
  input: z.string().max(2000).nullable(),expectedPhase:z.string().max(40).optional() }).strict();

export async function POST(req: NextRequest) {
  try {
    const { claims } = await authenticatedAgentSession(req);
    const body = Body.safeParse(await req.json().catch(() => null));
    if (!body.success) throw new AgentError(400, "invalid_agent_turn");
    const { requestId, expectedStep, input,expectedPhase } = body.data;
    // A six-digit code must not leave a brute-forceable hash in a replay receipt.
    const hash = createHmac('sha256', process.env.MEALLINE_AGENT_KEY!)
      .update(JSON.stringify({ expectedStep, input,expectedPhase })).digest('hex');
    const response = await withAgentSessionLock(claims.sessionId, async client => inTransaction(async () => {
      const previous = await client.query(`SELECT input_hash, response FROM voice_agent_turns WHERE session_id=$1 AND request_id=$2`, [claims.sessionId, requestId]);
      if (previous.rows.length) {
        if (previous.rows[0].input_hash !== hash) throw new AgentError(409, "request_id_conflict");
        return previous.rows[0].response;
      }
      const session = await getSession(claims.sessionId);
      if (!session || session.status !== "active") throw new AgentError(409, "session_not_active");
      if (session.step !== expectedStep) throw new AgentError(409, "stale_agent_turn");
      if(expectedPhase && session.phone_state?.phase!==expectedPhase)throw new AgentError(409,'stale_agent_turn');
      const ctx = await demoContext();
      const result = await processTurn(session.id, input, {
        orgId: ctx.orgId, providerId: ctx.providerId, publicBaseUrl: claims.publicBaseUrl,
      }, pipecatModel());
      const safe = { reply: result.reply, done: result.done, handoff: result.handoff,
        step: result.session.step, language: result.session.language,
        status: result.session.status, caseNumber: result.caseNumber,
        fallback: !streamingLanguage(result.session.language) };
      Object.assign(safe,{digitCount:phoneDigitCount(result.session),protectedInput:protectedPhoneInput(result.session),clientPhone:!!result.session.phone_state,phonePhase:result.session.phone_state?.phase});
      await client.query(`INSERT INTO voice_agent_turns (session_id,request_id,input_hash,response) VALUES ($1,$2,$3,$4::jsonb)`,
        [session.id, requestId, hash, JSON.stringify(safe)]);
      return safe;
    },client));
    return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof AgentError ? error.code : "agent_unavailable" },
      { status: error instanceof AgentError ? error.status : 503 });
  }
}
