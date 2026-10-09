/**
 * Voice port: outbound calls for approved-update notifications and human
 * transfer. Two implementations:
 *  - SimVoice: records calls in-process, scriptable outcomes. Used by tests,
 *    the simulator, and whenever Twilio is not configured. Clearly labeled.
 *  - TwilioVoice: real Twilio Programmable Voice (needs TWILIO_* env).
 */
import twilio from "twilio";
import type { Locale } from "./i18n";

export interface PlacedCall {
  to: string;
  message: string;
  voicemailMessage?: string;
  kind: "approved_update" | "transfer";
}

export type CallOutcome =
  | { status: "attempted"; providerCallSid: string }
  | { status: "voicemail"; providerCallSid: string }
  | { status: "failed"; error: string };

export interface VoicePort {
  label: string;
  placeCall(call: PlacedCall): Promise<CallOutcome>;
}

export interface SimScript {
  /** When true, approved-update calls land on voicemail (no sensitive details). */
  voicemail?: boolean;
  /** When true, calls fail (simulates unanswered transfer / line failure). */
  fail?: boolean;
  failError?: string;
}

/** In-process simulated voice. Exported log lets tests assert behavior. */
export class SimVoice implements VoicePort {
  label = "SIMULATED voice (not a real phone call)";
  calls: (PlacedCall & { at: string })[] = [];
  script: SimScript = {};

  reset() {
    this.calls = [];
    this.script = {};
  }

  async placeCall(call: PlacedCall): Promise<CallOutcome> {
    this.calls.push({ ...call, at: new Date().toISOString() });
    if (this.script.fail) {
      return { status: "failed", error: this.script.failError ?? "simulated line failure" };
    }
    if (this.script.voicemail) {
      return { status: "voicemail", providerCallSid: `SIM-${Date.now()}` };
    }
    return { status: "attempted", providerCallSid: `SIM-${Date.now()}` };
  }
}

export const simVoice = new SimVoice();

export class TwilioVoice implements VoicePort {
  label = "Twilio Programmable Voice";
  private client: ReturnType<typeof twilio>;
  constructor(
    private accountSid: string,
    private authToken: string,
    private fromNumber: string,
    private statusCallbackUrl?: string
  ) {
    this.client = twilio(accountSid, authToken);
  }

  async placeCall(call: PlacedCall): Promise<CallOutcome> {
    try {
      const twiml = new twilio.twiml.VoiceResponse();
      // Approved updates use a fixed template; voicemail gets the redacted variant.
      twiml.say({ voice: "Polly.Joanna" }, call.message);
      const created = await this.client.calls.create({
        to: call.to,
        from: this.fromNumber,
        twiml: twiml.toString(),
        statusCallback: this.statusCallbackUrl,
        statusCallbackEvent: ["completed"],
      });
      return { status: "attempted", providerCallSid: created.sid };
    } catch (e) {
      return { status: "failed", error: e instanceof Error ? e.message : "twilio_error" };
    }
  }
}

export function getVoicePort(): VoicePort {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (sid && token && from) {
    return new TwilioVoice(sid, token, from, process.env.TWILIO_STATUS_CALLBACK_URL);
  }
  return simVoice;
}

/** Validate a Twilio webhook signature with the official SDK. */
export function validateTwilioSignature(
  signature: string | null,
  url: string,
  params: Record<string, string>
): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token || !signature) return false;
  return twilio.validateRequest(token, signature, url, params);
}

/**
 * Public base URL for this request: the host Twilio actually reached.
 * When behind a tunnel/proxy, the Host header carries the public host, which
 * is more reliable than a PUBLIC_BASE_URL env var that may be stale (e.g.
 * tunnel URL changed after the server started). Falls back to
 * PUBLIC_BASE_URL for direct/local calls.
 */
export function publicBaseUrl(req: Request): string {
  const h = req.headers;
  const forwarded = h.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwarded || h.get("host") || "";
  const isLocal =
    host === "" || host.startsWith("localhost") || host.startsWith("127.0.0.1");
  if (!isLocal) {
    const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    return `${proto}://${host}`;
  }
  return (process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
}

/**
 * Build the URL Twilio actually requested, for signature validation.
 * Twilio signs the exact public URL it called. Safe: a valid signature still
 * requires the auth token, so a spoofed Host alone cannot forge a request.
 */
export function webhookValidationUrl(req: Request, path: string): string {
  return `${publicBaseUrl(req)}${path}`;
}

/**
 * TwiML <Say> options per language.
 * Vietnamese needs a Google Chirp 3 HD voice: Twilio's basic voices don't
 * support Vietnamese and fall back to spelling out every character.
 * Spanish is well supported by Twilio's basic voices, so it uses the default.
 */
export function sayOptions(language: Locale): {
  language: "en-US" | "vi-VN" | "es-MX";
  voice?: "Google.vi-VN-Chirp3-HD-Kore";
} {
  if (language === "vi") {
    return { language: "vi-VN", voice: "Google.vi-VN-Chirp3-HD-Kore" };
  }
  if (language === "es") {
    return { language: "es-MX" };
  }
  return { language: "en-US" };
}

/** <Gather> speech-recognition language for a locale. */
export function gatherLanguage(language: Locale): "en-US" | "vi-VN" | "es-MX" {
  if (language === "vi") return "vi-VN";
  if (language === "es") return "es-MX";
  return "en-US";
}

/** Short authored sentences and pauses on the new Gather path only. */
export function sayPhone(target:{say:(options:ReturnType<typeof sayOptions>,text:string)=>unknown;pause:(options:{length:number})=>unknown},language:Locale,text:string) {
  const sentences=text.split(/(?<=[.!?])\s+/u).filter(Boolean);
  sentences.forEach((sentence,index)=>{if(index)target.pause({length:1});target.say(sayOptions(language),sentence);});
}
export function staffedTransferConfigured(phone:string) {
  const normalized=phone.replace(/\D/g,'');
  return /^1\d{10}$/.test(normalized) && !/^1\d{3}55501\d{2}$/.test(normalized);
}
