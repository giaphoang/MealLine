import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { getSessionByCallId, processTurn, promptForSession, type TurnResult } from "@/lib/controller";
import { pipecatTwiml } from "@/lib/agent";
import { t } from "@/lib/i18n";
import { demoContext } from "@/lib/demo";
import { validateTwilioSignature, webhookValidationUrl, publicBaseUrl, sayOptions, gatherLanguage,sayPhone,staffedTransferConfigured } from "@/lib/voice";
import { recordEvent } from "@/lib/cases";
import type { Locale } from "@/lib/i18n";
import { phoneDigitCount, protectedPhoneInput } from '@/lib/phoneFlow';
import type { SessionRow } from '@/lib/controller';
import { db } from '@/lib/db';

async function formParams(req: NextRequest): Promise<Record<string, string>> {
  const form = await req.formData();
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) out[k] = String(v);
  return out;
}

function twimlResponse(xml: string): NextResponse {
  return new NextResponse(xml, { headers: { "content-type": "text/xml" } });
}

function gatherTwiml(base: string, sayText: string, language: Locale, legacy = false, session?: SessionRow): string {
  const vr = new twilio.twiml.VoiceResponse();
  const query=new URLSearchParams();if(legacy)query.set('agentFallback','1');
  if(session?.phone_state){query.set('phonePhase',session.phone_state.phase);query.set('phoneStep',session.step);}
  const gather = vr.gather({
    input: ["speech", "dtmf"],
    action: `${base}/api/voice/turn${query.size?'?'+query.toString():''}`,
    method: "POST",
    timeout: session && protectedPhoneInput(session) ? 30 : 8,
    speechTimeout: "auto",
    speechModel: "phone_call",
    numDigits: session ? phoneDigitCount(session) : 1,
    language: gatherLanguage(language),
  });
  if(session?.phone_state)sayPhone(gather,language,sayText);else gather.say(sayOptions(language),sayText);
  vr.redirect({ method: "POST" }, `${base}/api/voice/turn?empty=1${legacy ? "&agentFallback=1" : ""}`);
  return vr.toString();
}

/** One conversation turn: speech/keypad -> controller -> next TwiML. */
export async function POST(req: NextRequest) {
  try {
    const params = await formParams(req);
    const sig = req.headers.get("x-twilio-signature");
    const url = new URL(req.url);
    const fullUrl = webhookValidationUrl(req, `/api/voice/turn${url.search}`);
    if (!validateTwilioSignature(sig, fullUrl, params)) {
      return new NextResponse("invalid signature", { status: 403 });
    }
    const callSid = params.CallSid;
    const session = callSid ? await getSessionByCallId(callSid) : null;
    if (!session) return new NextResponse("unknown call", { status: 404 });

    const emptyRedirect = url.searchParams.get("empty") === "1";
    const input = emptyRedirect ? null : (params.SpeechResult || params.Digits || null);
    const ctx = await demoContext();
    const legacy = url.searchParams.get("agentFallback") === "1";
    let result: TurnResult;
    const stalePhone=session.phone_state && ((url.searchParams.has('phonePhase')&&url.searchParams.get('phonePhase')!==session.phone_state.phase)
      || (url.searchParams.has('phoneStep')&&url.searchParams.get('phoneStep')!==session.step));
    if (url.searchParams.get("agentResume") === "1" || stalePhone) {
      // The stream ended, not an empty caller turn. Resume the exact state;
      // transfer/receipt remain authored and executed by MealLine.
      result = { session, done: session.status !== "active", caseId: session.case_id ?? undefined,
        reply: session.status === "active" ? promptForSession(session)
          : session.status === "completed" ? session.phone_state ? promptForSession(session) : t(session.language).thanks_submitted
          : session.status === "transferred" ? t(session.language).transfer_to_human
          : t(session.language).hangup_saved,
        handoff: session.status === "transferred" ? { mode: "transfer", reason: "pipecat_handoff" } : null };
    } else result = await processTurn(session.id, input, {
      orgId: ctx.orgId, providerId: ctx.providerId,
      publicBaseUrl: publicBaseUrl(req),
    });
    const lang = result.session.language;
    const base = publicBaseUrl(req);

    if (!legacy && !result.done) {
      const stream = await pipecatTwiml(result.session, base);
      if (stream) return twimlResponse(stream);
    }

    if (result.done && result.handoff?.mode === "transfer") {
      // Human transfer to the allow-listed staffed number.
      const vr = new twilio.twiml.VoiceResponse();
      if(result.session.phone_state && !staffedTransferConfigured(ctx.transferNumber)){
        await db().query(`UPDATE conversation_sessions SET status='callback' WHERE id=$1`,[session.id]);
        const messages={en:'Our staff line is not configured. Please contact the pantry directly.',es:'La línea del personal no está configurada. Comuníquese directamente con la despensa.',vi:'Chưa có đường dây nhân viên. Vui lòng liên hệ trực tiếp với cơ sở thực phẩm.'};
        sayPhone(vr,lang,messages[lang]);vr.hangup();return twimlResponse(vr.toString());
      }
      vr.say(sayOptions(lang), result.reply);
      const dial = vr.dial({ action: `${base}/api/voice/dial-status`, method: "POST", timeout: 20 });
      dial.number(ctx.transferNumber);
      if (result.caseId) {
        await recordEvent(result.caseId, "system", "transfer_dialed",
          { to: "staffed_number", callSid });
      }
      return twimlResponse(vr.toString());
    }

    if (result.done) {
      const vr = new twilio.twiml.VoiceResponse();
      if(result.session.phone_state)sayPhone(vr,lang,result.reply);else vr.say(sayOptions(lang),result.reply);
      vr.hangup();
      return twimlResponse(vr.toString());
    }
    return twimlResponse(gatherTwiml(base, result.reply, lang, legacy,result.session));
  } catch {
    return new NextResponse("voice_unavailable", { status: 503 });
  }
}
