# MealLine — 3-minute demo script

All names, numbers, and requests are synthetic. Narrate the "synthetic"
label whenever it matters.

## 0:00–0:25 — The problem

"Pantry delivery exists, but requesting it can be hard if you can't get to a
pantry, can't wait on hold, or don't speak English confidently. MealLine lets
people request delivery through an ordinary phone call or a simple text form —
one question at a time — and gives staff a structured queue to review,
approve, and track. A received request is never a confirmed delivery."

## 0:25–1:15 — Vietnamese first-time request (simulator, labeled SIMULATED)

Open `/simulator`, run the **"Vietnamese first-time request (text)"** preset.
Narrate:

- The caller picks Vietnamese; every prompt, read-back, and confirmation is
  in Vietnamese. Diacritics are preserved; the English street name is kept,
  not translated.
- At the read-back step, point out the full summary before anything is saved.
- Mention: the same controller drives the real phone line (`/api/voice/*`);
  the simulator just replaces the telephone network.

Then run the **"Correction flow"** preset: the caller says "correct" at the
read-back, fixes the address, and confirms. "Corrections update the draft —
they never silently overwrite a master record."

## 1:15–2:00 — Staff review and approval

Open `/staff`, sign in as `coordinator@demo.local`:

- The queue shows the new case: age, Vietnamese language flag, unknowns.
- Open the case: verified facts, ZIP service-area check, the demo policy
  (no income/age/disability requirements), candidate slots with remaining
  capacity, full event timeline.
- In the approve panel: pick a slot, tick both staff checks, approve. Narrate:
  "Approval locks the case and the slot, rechecks capacity, and saves the
  booking plus the notification job in one transaction — two staff approving
  the last slot can't both succeed."

## 2:00–2:30 — Update and separate fulfillment

- Note the notification job the worker picks up (simulated voice call in the
  demo). "A connected call is not recipient acknowledgement — and voicemail
  gets a redacted message with no address or phone number."
- Open the applicant's secure status link (from the simulator transcript):
  minimal status, no private details.
- Back in the case, **Record outcome → Fulfilled**. "Approval was never
  counted as fulfillment. Only this explicit step closes the loop."

## 2:30–3:00 — No-capacity branch and measured results

- Run the **"English first-time request"** preset twice, approve both against
  the single-capacity slot: the second approval fails with `no_capacity`.
- Mark it **No capacity — schedule follow-up**: the case stays visible with an
  owner and a follow-up time. "No silent success, ever."
- Show `docs/evaluation-report.md`: 24/24 tests across the 12 functional
  scenarios, measured intake/approval timings, and the release gates.
- Close with the pilot plan: shadow use with staff review before anything
  touches live service; Vietnamese wording still needs fluent-speaker review;
  real telephony still needs credentials and a public webhook.
