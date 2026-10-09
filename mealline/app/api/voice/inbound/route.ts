import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { createSession } from "@/lib/controller";
import { validateTwilioSignature, webhookValidationUrl, publicBaseUrl, sayOptions } from "@/lib/voice";
import { t, type Locale } from "@/lib/i18n";

async function formParams(req: NextRequest): Promise<Record<string, string>> {
  const form = await req.formData();
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) out[k] = String(v);
  return out;
}

function checkSignature(
  req: NextRequest, path: string, params: Record<string, string>
): NextResponse | null {
  const sig = req.headers.get("x-twilio-signature");
  if (!validateTwilioSignature(sig, webhookValidationUrl(req, "/api/voice/inbound"), params)) {
    return new NextResponse("invalid signature", { status: 403 });
  }
  return null;
}

function gatherTwiml(base: string, parts: { locale: Locale; text: string }[], actionPath: string,clientPhone=false): string {
  const vr = new twilio.twiml.VoiceResponse();
  const gather = vr.gather({
    input: ["speech", "dtmf"],
    action: `${base}${actionPath}`,
    method: "POST",
    timeout: 8,
    speechTimeout: "auto",
    speechModel: "phone_call",
    numDigits: 1,
    language: "en-US",
    // Boost recognition of language names so the selector hears them
    // even through the English transcription model.
    hints: "english español espanol vietnamese tiếng việt xin chào hola necesito",
  });
  // Trilingual welcome: each part spoken in its native voice. The caller just
  // talks naturally; the language step detects it. Keypad 1/2/9 still works
  // silently as an accessibility fallback.
  for (const [index,part] of parts.entries()) {
    if(clientPhone&&index)gather.pause({length:1});
    gather.say(sayOptions(part.locale), part.text);
  }
  vr.redirect({ method: "POST" }, `${base}/api/voice/turn?empty=1`);
  return vr.toString();
}

function twimlResponse(xml: string): NextResponse {
  return new NextResponse(xml, { headers: { "content-type": "text/xml" } });
}

/** Inbound call: validate signature, open a session, ask the first question. */
export async function POST(req: NextRequest) {
  try {
    const params = await formParams(req);
    const bad = checkSignature(req, "/api/voice/inbound", params);
    if (bad) return bad;
    const callSid = params.CallSid;
    if (!callSid) return new NextResponse("missing CallSid", { status: 400 });
    const session=await createSession({ channel: "voice", providerCallId: callSid });
    const parts = t("en").greeting_voice_parts;
    return twimlResponse(gatherTwiml(publicBaseUrl(req), parts, "/api/voice/turn",!!session.phone_state));
  } catch {
    return new NextResponse('voice_unavailable', { status: 503 });
  }
}
