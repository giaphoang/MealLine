import { NextRequest, NextResponse } from "next/server";
import { getSessionByCallId, abandonSession } from "@/lib/controller";
import { validateTwilioSignature, webhookValidationUrl } from "@/lib/voice";
import { recordEvent } from "@/lib/cases";
import { db } from '@/lib/db';
import { callSnapshot, queuePhoneCommand, commandId } from '@/lib/nourishPhone';

async function formParams(req: NextRequest): Promise<Record<string, string>> {
  const form = await req.formData();
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) out[k] = String(v);
  return out;
}

/**
 * Twilio call progress callbacks: record acknowledgement/transfer outcomes.
 * A connected call is NOT recipient acknowledgement; that stays separate.
 */
export async function POST(req: NextRequest) {
  const params = await formParams(req);
  const sig = req.headers.get("x-twilio-signature");
  const url = new URL(req.url);
  const path = url.pathname;
  if (!validateTwilioSignature(sig, webhookValidationUrl(req, `${path}${url.search}`), params)) {
    return new NextResponse("invalid signature", { status: 403 });
  }
  const callSid = params.CallSid;
  const status = path.endsWith('/dial-status') ? params.DialCallStatus ?? params.CallStatus ?? 'unknown' : params.CallStatus ?? 'unknown';
  if (callSid) {
    const session = await getSessionByCallId(callSid);
    if(session?.phone_state && !path.endsWith('/dial-status') && ['completed','failed','busy','no-answer','canceled'].includes(status)) {
      await db().query(`UPDATE conversation_sessions SET phone_state=jsonb_set(phone_state,'{callEndedAt}',to_jsonb($2::text)) WHERE id=$1`,[session.id,new Date().toISOString()]);
    }
    if (session?.case_id) {
      await recordEvent(session.case_id, "system", "voice_status_callback", {
        callSid, status,
        // Never claim connection succeeded on ambiguous results.
        acknowledged: false,
      });
    }
    // Failed/unanswered human transfer -> callback path stays visible.
    if (path.endsWith("/dial-status") &&
        ["no-answer", "failed", "busy", "canceled"].includes(status)) {
      if (session) await abandonSession(session.id).catch(() => undefined);
      if (session?.phone_state?.privacy) {
        const call=await callSnapshot(session,'needs_followup','Staff transfer failed; follow-up required.');
        await queuePhoneCommand({id:commandId(),callId:session.id,kind:'request_human',reason:'Staff transfer failed.',call},session.id);
      }
    }
    if (!path.endsWith("/dial-status") && session?.status === "active"
      && ["completed", "failed", "busy", "no-answer", "canceled"].includes(status)) {
      await abandonSession(session.id);
    }
  }
  return new NextResponse("<Response/>", { headers: { "content-type": "text/xml" } });
}
