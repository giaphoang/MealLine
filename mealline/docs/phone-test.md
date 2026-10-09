# Real phone test — Twilio end-to-end

The voice webhook path (`/api/voice/inbound`, `/api/voice/turn`,
`/api/voice/status`, `/api/voice/dial-status`) is verified without a Twilio
account via `scripts/voice-webhook-check.mjs` (14/14 checks: signature
validation, full intake to hangup, 404s). This guide covers the remaining
step: a real call through the Twilio network.

## What you need

- A Twilio account and one phone number (trial works; trial numbers can only
  call numbers you verify in the Twilio console — use your own mobile).
- A public HTTPS URL for this server (tunnel below).
- ~$2–5 of Twilio credit for a few minutes of calls.

## 1. Expose the server

```bash
# terminal 1 — app (from the mealline directory)
MEALLINE_DATABASE_URL=postgres://postgres@127.0.0.1:5432/mealline \
TWILIO_AUTH_TOKEN=<from Twilio console> \
PUBLIC_BASE_URL=https://<your-tunnel-host> \
npm run dev

# terminal 2 — worker (approved-update calls go through here)
MEALLINE_DATABASE_URL=postgres://postgres@127.0.0.1:5432/mealline \
TWILIO_ACCOUNT_SID=<sid> TWILIO_AUTH_TOKEN=<token> \
TWILIO_FROM_NUMBER=<your Twilio number> \
TWILIO_STATUS_CALLBACK_URL=https://<your-tunnel-host>/api/voice/status \
npm run worker

# terminal 3 — public tunnel (no account needed)
cloudflared tunnel --url http://127.0.0.1:3000
```

Use the `https://…trycloudflare.com` URL cloudflared prints as
`PUBLIC_BASE_URL` / `TWILIO_STATUS_CALLBACK_URL`.

## 2. Point Twilio at the app

In the Twilio console, on your phone number's Voice configuration:

- **A call comes in** → Webhook → `https://<tunnel>/api/voice/inbound` (HTTP POST)
- **Call status changes** → `https://<tunnel>/api/voice/status`

All webhooks are signature-validated with `TWILIO_AUTH_TOKEN`; anything else
gets a 403.

## 3. Call test script

From your own (verified, consented) phone, call the Twilio number:

1. **Greeting** — hear the English greeting offering Vietnamese / human.
2. **Language** — say "Vietnamese" or press 2; confirm prompts switch.
3. **Intake** — answer address, household, timing, contact, accommodation;
   confirm the read-back repeats everything correctly.
4. **Correction** — give a wrong address, say "sửa"/"correction", fix it.
5. **Completion** — say "yes"; hear the receipt message; call ends.
6. **Staff side** — open `/staff`, find the new case, verify the transcript
   fields, approve it, and (worker running) receive the update call.
7. **Transfer** — call again, say "gặp nhân viên"; the staffed number rings.
8. **Hangup mid-call** — hang up during intake; the case stays visible as
   abandoned/callback, never silently dropped.

## 4. What "working" means

- Every webhook returns valid TwiML; Twilio's debugger shows no 4xx/5xx.
- The case in `/staff` matches what was spoken, diacritics preserved.
- The outbound update call arrives after approval; voicemail gets the
  redacted message (no address/phone details).
- A failed transfer leaves a visible callback case for staff.

## Cost notes

Trial credit covers the whole script. Upgrade only if you need to call
unverified numbers. Keep the tunnel URL out of the repo — it changes every
run.
