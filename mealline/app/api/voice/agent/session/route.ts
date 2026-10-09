import { NextRequest, NextResponse } from "next/server";
import { AgentError, authenticatedAgentSession, streamingLanguage } from "@/lib/agent";
import { promptForSession } from "@/lib/controller";
import { phoneDigitCount, protectedPhoneInput } from '@/lib/phoneFlow';

export async function GET(req: NextRequest) {
  try {
    const { session } = await authenticatedAgentSession(req);
    return NextResponse.json({ step: session.step, language: session.language,
      status: session.status, reply: promptForSession(session),
      digitCount: phoneDigitCount(session), protectedInput: protectedPhoneInput(session),
      clientPhone:!!session.phone_state,
      phonePhase:session.phone_state?.phase,
      fallback: !streamingLanguage(session.language) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof AgentError ? error.code : "agent_unavailable" },
      { status: error instanceof AgentError ? error.status : 503 });
  }
}
