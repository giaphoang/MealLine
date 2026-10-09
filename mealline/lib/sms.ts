/**
 * SMS port: text-message receipts (case number + status link) after intake.
 * Two implementations:
 *  - SimSms: records messages in-process. Used by tests, the simulator, and
 *    whenever Twilio is not configured. Clearly labeled.
 *  - TwilioSms: real Twilio Programmable SMS (needs TWILIO_* env).
 */
import twilio from "twilio";

export interface SmsResult {
  status: "sent" | "failed";
  sid?: string;
  error?: string;
}

export interface SmsPort {
  label: string;
  sendSms(to: string, body: string): Promise<SmsResult>;
  /** In-process log of sent messages (sim) or recent sends (for tests). */
  sent: { to: string; body: string; at: string }[];
}

/** In-process simulated SMS. Exported log lets tests assert behavior. */
export class SimSms implements SmsPort {
  label = "SIMULATED SMS (not a real text message)";
  sent: { to: string; body: string; at: string }[] = [];

  reset() {
    this.sent = [];
  }

  async sendSms(to: string, body: string): Promise<SmsResult> {
    this.sent.push({ to, body, at: new Date().toISOString() });
    return { status: "sent", sid: `SIM-${Date.now()}` };
  }
}

export const simSms = new SimSms();

export class TwilioSms implements SmsPort {
  label = "Twilio Programmable SMS";
  sent: { to: string; body: string; at: string }[] = [];
  private client: ReturnType<typeof twilio>;

  constructor(
    private accountSid: string,
    private authToken: string,
    private fromNumber: string
  ) {
    this.client = twilio(accountSid, authToken);
  }

  async sendSms(to: string, body: string): Promise<SmsResult> {
    try {
      const msg = await this.client.messages.create({
        to,
        from: this.fromNumber,
        body,
      });
      this.sent.push({ to, body, at: new Date().toISOString() });
      return { status: "sent", sid: msg.sid };
    } catch (e) {
      return { status: "failed", error: e instanceof Error ? e.message : "sms_error" };
    }
  }
}

export function getSmsPort(): SmsPort {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (sid && token && from) {
    return new TwilioSms(sid, token, from);
  }
  return simSms;
}
