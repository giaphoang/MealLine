/**
 * Voice webhook end-to-end check (no Twilio account needed).
 *
 * Exercises the REAL Twilio webhook path — /api/voice/inbound and
 * /api/voice/turn — using self-computed Twilio signatures, exactly the way
 * Twilio signs its requests (HMAC-SHA1 over URL + sorted params).
 *
 * Verifies: signature validation (403 on bad sig), session creation,
 * <Gather> TwiML flow, a full 7-turn intake conversation to <Hangup>,
 * and 404 on unknown CallSids.
 *
 * Usage:
 *   # terminal 1
 *   MEALLINE_DATABASE_URL=... TWILIO_AUTH_TOKEN=<token> \
 *     PUBLIC_BASE_URL=http://127.0.0.1:3100 npm run dev
 *   # terminal 2
 *   MEALLINE_BASE_URL=http://127.0.0.1:3100 \
 *     TWILIO_AUTH_TOKEN=<token> node scripts/voice-webhook-check.mjs
 *
 * The token here only needs to match the server's TWILIO_AUTH_TOKEN so the
 * signatures validate; any value works. Nothing touches the real network.
 */
import crypto from "node:crypto";

const TOKEN = process.env.TWILIO_AUTH_TOKEN;
if (!TOKEN) {
  console.error("Set TWILIO_AUTH_TOKEN to the same value the server uses.");
  process.exit(2);
}
const BASE = (process.env.MEALLINE_BASE_URL || "http://127.0.0.1:3100").replace(/\/$/, "");

function sign(url, params) {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return crypto.createHmac("sha1", TOKEN).update(data).digest("base64");
}

async function post(path, params, goodSig) {
  const url = BASE + path;
  const sig = goodSig === false ? "bogus" : sign(url, params);
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": sig,
    },
    body: new URLSearchParams(params),
  });
  return { status: r.status, text: await r.text() };
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + " " + (extra || "")); }
}

console.log("== voice webhook end-to-end (self-signed) ==");

let r = await post("/api/voice/inbound", { CallSid: "CAxxx", From: "+1555" }, false);
check("bad signature rejected (403)", r.status === 403, "got " + r.status);

const CALLSID = "CAtest" + Date.now();
r = await post("/api/voice/inbound", { CallSid: CALLSID, From: "+15155550142", To: "+15155550000" });
check("inbound accepted (200)", r.status === 200, "got " + r.status);
check("inbound returns <Gather>", r.text.includes("<Gather>"));
check("inbound greeting offers Vietnamese", /vietnamese/i.test(r.text));

const script = [
  "English",
  "1234 Grand Avenue, Des Moines, 50312",
  "4 people",
  "weekday mornings",
  "call me at 515-555-0142",
  "please leave at the door",
  "yes",
];
let last = r.text;
for (const line of script) {
  r = await post("/api/voice/turn", { CallSid: CALLSID, SpeechResult: line });
  check('turn "' + line.slice(0, 24) + '" -> 200', r.status === 200,
    "got " + r.status + ": " + r.text.slice(0, 120));
  last = r.text;
}
check("final turn hangs up", last.includes("<Hangup>"), last.slice(0, 200));
// Voice callers get a spoken confirmation, not a clickable link (correct).
check("final turn confirms receipt (spoken)", /received and sent to our staff/i.test(last),
  last.slice(0, 200));

const r2 = await post("/api/voice/turn", { CallSid: "CAnope", SpeechResult: "hi" });
check("unknown CallSid -> 404", r2.status === 404, "got " + r2.status);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
