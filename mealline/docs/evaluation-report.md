# MealLine — Evaluation Report

Generated: 2026-10-08T20:34:22.948Z (synthetic setting; sample = scripted runs, not real applicants)

## Method

- Fresh isolated schema per run (`resetFixtures`), deterministic conversation model, simulated voice port.
- No real phone calls, no real pantry, no real applicants. Nothing here counts as "households helped."
- UI keyboard/screen-reader walkthrough verified by code inspection (labels, aria-live, focus states);
  needs a real device/browser check before any pilot claim.
- Vietnamese wording written for the demo; NOT yet reviewed by a fluent speaker.

## Measurements

| Check | Result | Detail |
| --- | --- | --- |
| intake:english_first_time | 36ms |  |
| intake:english_first_time:result | completed | status=needs_review lang=en |
| intake:vietnamese_first_time | 15ms |  |
| intake:vietnamese_first_time:result | completed | status=needs_review lang=vi |
| intake:correction_at_readback | 20ms |  |
| intake:correction_at_readback:result | completed | status=needs_review lang=en |
| intake:unknown_zip_to_review | 12ms |  |
| intake:unknown_zip_to_review:result | completed | status=needs_review lang=en |
| intake:completion_rate | 4/4 | scripted deterministic-model runs, synthetic data |
| approval:transaction | 2ms |  |
| approval:result | booked |  |
| notify:approved_update | 1ms |  |
| notify:simulated_calls_placed | 1 |  |
| race:last_slot_winners | 1/2 | exactly one booking, as required |
| handoff:two_silences | 3ms | mode=callback |

## Functional scenarios (proposal §10)

All 12 scenarios plus the voice adapter are covered by `npm test`; run it separately to verify results:

1. First-time applicant EN + VI: intake → review → booking → acknowledged update; diacritics,
   addresses, household sizes, negations preserved; status-link auth enforced.
2. Address correction updates the draft/case; the master recipient record is never silently overwritten.
3. Failed verification returns `{found:false}` with no record data disclosed.
4. Silence ×2 → callback case; `person` / `gặp nhân viên` / `0` → handoff; hangup persists partial intake;
   unanswered transfer falls back to a visible callback follow-up.
5. Last-slot race: exactly one of two concurrent approvals books.
6. Repeated approval with the same idempotency key → one booking; duplicate webhook → one session.
7. No capacity → `awaiting_followup` with owner + next-action time; case stays visible, never silent success.
8. Notification failure after bounded retries → visible follow-up; no false acknowledgement.
9. Unknown tools and unknown options rejected by the dispatcher and logged on the timeline.
10. Cross-org reads return nothing; `staff` role cannot approve; cross-org approval blocked.
11. Approval ≠ fulfillment; draft cases cannot be marked fulfilled; outcome must be explicit.
12. Voicemail body carries no address, phone digits, or household details — callback request only.

## Release gates (§10)

- [x] No unauthorized bookings in the test suite (authz tests).
- [x] No duplicate bookings (idempotency tests).
- [x] No last-slot overbooking (race test).
- [x] No confirmation before provider approval (approval transaction commits before any notification).

Total eval time: 334ms

## Known limitations

- Real Twilio telephony not exercised (no credentials / public HTTPS webhook in this environment).
- Vietnamese voice (ASR/TTS) unverified; Vietnamese path demonstrated via text.
- LLM extraction runs the deterministic implementation; the HTTP model port is configured but
  untested against a live model.
- No SMS channel; status-link and voice-callback only.
- Pilot metrics (handling time, fulfillment rate) need a real pilot; not claimed here.
