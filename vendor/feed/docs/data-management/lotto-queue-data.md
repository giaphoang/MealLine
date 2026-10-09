# LOTTO Queue Data

**Status:** Implemented for FEED v1.6.0 and LOTTO v1.21.0.

FEED imports privacy-minimized, immutable queue-session closeouts from LOTTO.
The records describe queue operations only: a ticket is never counted as a
visit, household, client, person, or completed service.

## Responsibility boundary

LOTTO records facts without asking staff to classify a reset. It preserves the
service date fixed at first issuance, the operating window in effect, issuance
batches, anonymous ticket issue and first-call timestamps, final outcomes,
Random-to-Sequential transitions, append activity, and immutable closeout
revisions. LOTTO v1.21.0 exposes those facts through the read-only v1 endpoint.

FEED owns interpretation. It synchronizes every source revision, advances the
source cursor in the same transaction as each complete page, and withholds
anomalous sessions from Service Analytics until staff review them. A staff
classification is an append-only overlay; it never edits or removes source
facts.

A classification binds to the exact immutable LOTTO source revision that staff
reviewed. If LOTTO later publishes corrected facts for the same session, FEED
evaluates that revision independently and does not inherit the older decision.

## Authentic-session rule

Rules version 1 automatically includes a session only when all four signals
are true:

1. every recorded activity instant is within one hour before or after the
   configured operating window;
2. every issued ticket has a first call;
3. the session changed from Random to Sequential; and
4. tickets were appended during the session.

Complete timing coverage and no unpaired legacy calls are also required. A
session that misses any condition is not called a test automatically. It is
stored as **Needs review** and contributes nothing to Queue Timing until staff
select **Include as service**. Staff may instead exclude it as testing, a
duplicate, or another documented reason.

## Historical snapshot import

Preserved `raffle_snapshots.csv` data is branch-aware state history, not a
future integration contract. Convert it to FEED's canonical queue-history CSV:

```bash
cd packages/backend
npm run convert:lotto-history -- /path/to/raffle_snapshots.csv /path/to/lotto-history.csv
```

The converter follows snapshot branches, reconstructs issuance and first-call
observations where the atomic state permits it, assigns deterministic source
identities, removes physical ticket numbers, and emits one `Summary JSON` row
per reconstructed session. Staff then use **Information → Data → Add Data** to
import that canonical file. Re-importing identical bytes is a no-op.

The preserved production export reviewed for this release reconstructs 14
non-empty sessions, 1,014 anonymous queue observations, and 926 recoverable
issue/first-call pairs. One session satisfies all four automatic authenticity
signals; the other thirteen enter staff review. That conservative result is a
quality decision, not data loss.

## Forward synchronization

An administrator first opens LOTTO's **History** card, selects **Sync history
with FEED**, and generates the one active synchronization token. LOTTO shows
the plaintext once and stores only its one-way hash. The administrator copies
the displayed LOTTO URL and token into **Information → Data → LOTTO Queue Data
→ Configure** in FEED. FEED encrypts its copy with the existing key manager and
never returns it to the browser.

Any staff member can then select **Sync now**. FEED pulls the LOTTO v1 endpoint
in append order (`recordedAt`, then `summaryId`), retains immutable revisions,
and shows the last successful synchronization time and review queue. Replaying
a page is safe; a failed page does not advance the cursor. Replacing only the
token for the same LOTTO URL preserves the cursor. Changing the source URL
clears that source-specific cursor and reconciles the new source's available
window from the beginning.

### Production pairing

Apply LOTTO's current `schema.sql` before deploying the pairing UI. The schema
adds one singleton credential row in Neon. No Vercel token variable or terminal
token-generation command is required for normal pairing.

Only one token can be active. Selecting **Generate new token** atomically
replaces the stored hash, immediately invalidating the token currently saved in
FEED. If FEED subsequently synchronizes with that old value, it reports that
LOTTO rejected the saved connection and tells the user to obtain a new token;
neither application returns or logs credential material. After copying the new
value into FEED, the existing cursor and historical sessions remain intact.

`LOTTO_FEED_INTEGRATION_TOKEN` remains a deployment migration fallback only
when LOTTO has no database token. The first token generated through the History
card takes precedence and becomes the sole valid credential. The legacy value
can then be removed from Vercel without affecting pairing.

## Analytics contract

Only the current revision of sessions effectively classified **Include as
service** contributes to the Service **Queue Timing** card and its shared PDF
and CSV accessor. The card reports:

- median, average, 75th-percentile, and 90th-percentile observed wait;
- median historical interval between first calls;
- the median local clock time of the last first-call in a service session; and
- included-session, observed-ticket, pending-review, and excluded-session
  counts.

Observed wait is `firstCalledAt - issuedAt`. Never-called and invalid negative
pairs are excluded rather than converted to zero. The metric describes
queue-entry-to-first-call unless staff have confirmed the LOTTO issuance action
matches the physical ticket handout. It is historical evidence, not a promise
or LOTTO's planned live service-capacity estimate.

## Backup boundary

Portable Service backups include LOTTO synchronization runs, session revisions,
anonymous ticket observations, quality issues, and staff resolutions. They
exclude the LOTTO URL, encrypted connection token, token salt, live cursor, and
encryption keys. Restoring Service preserves the union of the artifact and any
newer LOTTO history already held by FEED, while preserving the destination's
connection and cursor. Operator database snapshots still contain the entire
database and remain a separate recovery mechanism.
