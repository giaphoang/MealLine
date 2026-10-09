# Backup and Restore Boundary

## Decision

**The in-app Backup is FEED's disaster-recovery artifact.** If the Pi is
destroyed, the recovery path is: build a new one, deploy the Docker image onto
a fresh FEED build, restore from a backup, resume operations. Everything the
organization needs to work is carried, minus the secrets named below, which are
re-established by hand.

*Revised 2026-09-03.* This document previously split the job across two
artifacts and assigned catastrophic recovery to the operator snapshot below.
That was wrong in practice for two reasons. A byte-level snapshot must be taken
by hand on the Pi, so the artifact that recovery depended on was the one nobody
was routinely producing — a recovery plan resting on a step that is never
rehearsed is a hypothesis. And a raw snapshot downloaded to a laptop is key
material at rest, which is the exact risk the split existed to avoid. The
sanitized artifact is the one that actually gets taken, and it is the safer of
the two to hold. It therefore has to be sufficient.

**Partial restore is retained and demoted.** Reverting one unit — "that import
was wrong, put inventory back to Tuesday" — is a weekly need, and it is safe on
the instance the backup came from, where ids line up by construction. It is a
convenience layered on a self-sufficient artifact, not a second product with
its own guarantees. Where the two ever conflict, catastrophic recovery wins.

### Operator disaster-recovery snapshot

A transactionally consistent SQLite snapshot is a byte-level recovery artifact.
It necessarily contains authentication records, encryption-key records,
encrypted API-key material, and other system configuration. It remains an
operator-controlled Raspberry Pi/deployment workflow and must not be offered as
a general browser download. It is a convenience for an operator already on the
box, **not** the recovery plan.

### Sanitized portable backup

The in-app **Backup** action produces a versioned logical export of approved
organization data. Three categories, not two — the middle one was added
2026-08-02 after excluding whole tables proved coarser than this document ever
asked for:

**Excluded entirely**

- `EncryptionKey` rows and equivalent key material;
- OTP and verification tokens, lockout records, and active session material;
- `AccessPolicy` — sign-in mode is authority, and a file that could flip an
  instance from Allowlist to Domain is the artifact-grants-access problem in
  another form;
- `AdminAuditLog` — a security record; importing it from a file would let
  someone rewrite the history of privileged actions;
- environment/deployment secrets;
- rows referencing files the artifact does not carry (documents, generated
  PDFs), and telemetry.

**Included with columns redacted**

- `AIConfiguration` minus `encryptedApiKey` and `salt`. The rest of that row —
  model, temperature, thinking level, token limits, cost limits, rate limits,
  active flag — is an administrator's work and should survive a restore. Only
  the secret leaves.

**Included, with authority neutralised**

- `User`. Excluding the roster does not preserve it: under build-and-swap the
  restored database is migrations plus artifact, so an absent roster means an
  *empty* one, which arms the fresh-instance bootstrap and hands administrator
  to whoever signs in first. The roster is therefore carried, but **every
  restored role lands as `STAFF`** regardless of the file, and the
  administrator performing the restore is re-granted. No artifact can confer
  authority; no one loses their staff list.

  This puts staff email addresses in the artifact. They are largely
  public-facing already, and an address without a reachable inbox cannot pass
  OTP.

**Rows referencing files the artifact does not carry.** Documents, generated
PDFs and their kin stay out: an uploaded file is storage, not database, and
FEED already handles a record whose file is missing
(`services/storage/reconciliation.ts` Phase 1 reports exactly that). But two
*included* tables hold foreign keys into that excluded set —
`Translation.documentId` and `FormattingChoice.documentId` — and for two years
nothing reconciled those two decisions. On the instance a backup came from the
parent rows are still present and the references resolve; on a fresh one they
do not exist, and the insert aborted the entire restore. Measured on a
production snapshot: 112 of 2,319 translations carry a `documentId`.

Such a reference is now **blanked on insert** when the destination cannot
resolve it, and only then — restoring onto the source instance keeps every link
that still works. The registry is `RESTORE_NULLED_REFERENCES`, the confirmation
dialog states what is lost before the administrator accepts, and
`restore-contract.test.ts` fails the build if a new foreign key of this shape
appears without an entry.

### The invariant

> Every included table's foreign keys must be satisfiable from the artifact
> alone.

This is a property of the **backup contract**, not of the restore units. It is
what makes an artifact a self-sufficient description of an organization rather
than a diff against whatever the destination happens to hold, and it is the one
sentence to check any future table against.

Because it is selective, this artifact is not a raw SQLite snapshot. Restore
must create and validate a compatible database, import the approved logical
records, and preserve destination-owned encryption and credentials during an
in-place restore. Restoring onto a new installation requires fresh encryption
initialization, AI provider keys, and external-service pairing because none of
those secrets are carried by the artifact.

## Status

**Backup shipped in 1.5.0-beta.6. Restore and clean-slate reset are both
implemented.**

The design pass this document called for has happened. Its decisions —
build-and-swap rather than a live transaction, in-memory maintenance mode,
replace-never-merge, partial units closed under foreign keys, the roster
resolution above, and the clean-slate model — are recorded in
[beta-6-backup-restore-brief.md](beta-6-backup-restore-brief.md), which also
named two prerequisites that had to land first: editable API keys, and
`AIConfiguration` redaction in place of exclusion. **Both are implemented.**
The artifact now declares table contract version 12: version 2 added sanitized
`AIConfiguration`; version 3 added the first formal Service and operational
metric fact family; version 4 adds effective-dated Service capacity plans,
structured quality issues, and append-only operator decisions; and version 5
adds explicit first/returning/unknown status to formal Service encounters; and
version 6 adds SIMC source-scoped people, person-profile revisions, and
encounter membership; and version 7 adds optional source metric labels and
workbook-cell provenance to operational observation revisions; version 8 adds
intentional clear revisions so migrated operational values can continue as
editable native Service Log data; and version 9 adds revisioned Service Metric
icons. Older artifacts restore the neutral `package` icon rather than inferring
meaning from a label. Older artifacts do not manufacture person
records or workbook provenance, and pre-v8 observations restore with the safe
`recorded` default rather than being reinterpreted as clears. Version 10 adds
privacy-minimized LOTTO session revisions, anonymous ticket observations,
quality issues, and append-only staff resolutions. Version 11 carries the
authority-neutralized staff roster and LOTTO synchronization-run provenance.
It still excludes the LOTTO URL, encrypted token, token salt, live cursor, and
encryption keys.
Version 12 adds the singleton organization brand configuration and its
database-backed logo and app-mark assets. Artifacts created before version 12
do not contain those tables; restoring one preserves the destination's current
brand rather than interpreting absence as an instruction to erase it. A version
12 artifact that deliberately includes either table with zero rows still
replaces that table with an empty set.
Version 4 artifacts restore with that new status defaulted to `unknown`; FEED
never infers it from unrelated fields. Transient `DataImportJob` progress and
staged source files remain excluded. Normalized Service revisions prepared
under a `pending` import are also filtered out, including pending-only client
identities; only activated or historical lifecycle data belongs in the portable
organization snapshot. Beta.6
artifacts declare version 1 and carry no `AIConfiguration` or Service tables.

## Recovery runbook

The artifact is necessary and not sufficient. These steps are the difference
between having a backup and having recovered, and the order matters — the
encryption key is established *before* the restore so it survives the swap
(`EncryptionKey` is excluded from the artifact, so it is not among the tables
the restore replaces, and the scratch database is a copy of the live one).

1. Deploy onto fresh hardware. The roster is empty and no encryption key
   exists, which arms the fresh-instance bootstrap.
2. **Sign in before anything else.** The first verified sign-in on an instance
   with no roster *and* no encryption key becomes Administrator. Initializing
   encryption first disarms that, and you would need the operator CLI
   (`docker compose exec backend node dist/cli/admin.js grant --email=…
   --confirm`) to get back in. The order of steps 2 and 3 is load-bearing.
3. Initialize encryption (Settings → the setup wizard, `POST /api/system/initialize`).
4. Restore the artifact.
5. **Re-grant your other administrators.** The artifact never carries roles —
   no file may confer authority — so every other account returns as Staff.
   Admin page, or `docker compose exec backend node dist/cli/admin.js grant
   --email=… --confirm`.
6. **Re-set the sign-in mode.** `AccessPolicy` is excluded for the same reason.
7. **Enter AI provider keys.** Restored model configurations arrive without
   their secret and therefore inactive; FEED refuses to activate one that has
   no key. Open each, enter the key, then activate.
8. Run a storage reconciliation. It will report the documents whose files did
   not travel. That is expected, not a fault.

What does not survive, by design: uploaded files, the administrator audit log,
API keys, the encryption key, and the association between a translation and the
document it was made from.

**This runbook is only worth what its last rehearsal proved.** It should be
executed end to end — a second Docker stack on a fresh volume is enough — by
someone who did not write it.

## Restore safety contract

Restore is privileged. Administrator authority now exists to gate it. The
workflow must:

1. upload to isolated temporary storage;
2. validate artifact type, manifest, checksums, FEED/schema version, and table
   contract before touching live data;
3. create an operator recovery snapshot before mutation;
4. enter controlled maintenance mode and stop new writes;
5. import or replace data atomically using the artifact-specific strategy;
6. run integrity and contract checks;
7. restart/reconnect the backend cleanly;
8. delete rejected and completed temporary artifacts;
9. preserve destination-owned secrets in place, or require fresh
   encryption/API-key setup when the artifact is restored onto a new
   installation.

Procurement rollback is not database restore. It is a reversible domain action
that changes which retained import revisions contribute to Analytics.
Service imports and source resolutions form their own foreign-key-closed restore
unit. Restoring Service does not restore Procurement, Inventory, or user
authority. LOTTO is the deliberate exception to replace-only restore semantics:
LOTTO retains a rolling source window while FEED owns the longer record, so a
Service restore keeps the union of immutable LOTTO revisions in the artifact
and newer revisions already in FEED. It restores synchronization runs with
their sessions, recalculates which revision is current, and stops before the
swap if one immutable identity has conflicting content. The destination's live
LOTTO connection and cursor remain untouched.
