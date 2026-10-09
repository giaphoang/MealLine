# Administrator Authorization

## Status

Roles, the user roster, the sign-in access policy, the privileged-action audit
log, and the Admin page are **implemented in 1.5.0-beta.4**. Sanitized backup
and restore remain deferred (ISSUES.md #50b).

The implementation contract, including the parts of this document that beta.4
revised, is `docs/auth/admin-page-implementation-plan.md`.

## Roles

FEED remains one shared organization-wide workspace. Roles authorize actions;
they do not partition feature data.

- **Staff**: ordinary authenticated application workflows.
- **Administrator**: Staff capabilities plus user-role management and sensitive
  system operations such as future sanitized backup/restore controls.

The Admin page is omitted from Staff navigation, but every privileged backend
route must independently enforce Administrator authority. A hidden page is not
authorization.

### LOTTO queue-data authority (v1.6.0)

LOTTO queue ingestion follows the responsibility of the action, not the broad
Service domain label:

- **Staff:** import canonical historical queue CSVs through Add Data, select
  **Sync now**, inspect synchronized sessions, and append an Analytics
  inclusion/exclusion classification with a reason.
- **Administrator:** all staff actions plus configure or replace the LOTTO
  endpoint and encrypted bearer token.

Queue records contain no client demographics and never create visits,
households, clients, or people. Classification is reversible through a newer
append-only decision and does not mutate source facts, so it does not warrant
administrator authority. Connection secrets do.

## Fresh-instance bootstrap

The first successfully verified user on a genuinely fresh deployment becomes
the initial Administrator. This must be an atomic server-side decision so two
simultaneous first logins cannot both exploit an unsafe check-then-write race.
Bootstrap must not run merely because all Administrators were later revoked or
deleted; that condition requires an explicit operator recovery path.

### Revision: populated instances (1.5.0-beta.4)

The rule above assumes an empty `User` table. FEED's production instance is not
fresh — `findOrCreateUser` has created a row on every successful verification
since the auth rollout, so "the first verified user" has no live referent there.

**Accepted decision:** on a populated instance, the beta.4 migration promotes
every user that already exists to Administrator, and the deploying
administrator prunes the roster manually. The existing cohort already had
unrestricted access to every route, since no authority check existed anywhere
before beta.4, so the promotion granted almost nothing they did not already
have. Role management is the one genuinely new capability, and that exposure is
bounded by pruning in the same session as the deploy.

Rejected: promoting the oldest row (authority by accident of history), arming
the bootstrap for the first sign-in after deploy (a privilege-escalation race
during pantry hours), and naming an address in the migration (a staff email
permanently in a public repo, and wrong for every other deployment).

Startup therefore resolves three states, not one:

| `User` table | Administrators | Encryption key | Behaviour |
| --- | --- | --- | --- |
| empty | — | absent | Atomic fresh-instance bootstrap, as above |
| empty | — | present | Never auto-assign; require the operator CLI |
| populated | zero | Never auto-assign; require the operator CLI |
| populated | ≥ 1 | Normal operation |

The middle row can now arise only from a pruning mistake, which is the
condition this document already required an operator path for. That path is
`node dist/cli/admin.js grant --email=… --confirm`.

## Lockout guards

Minimums scale with the access mode, because the risk does:

- **Always:** at least one Administrator.
- **Allowlist mode:** at least two Administrators who can actually sign in — a
  primary and an alternate, so a changed or lost mailbox cannot strand the
  instance.

In Domain mode a lockout requires losing the whole mail domain; in Allowlist
mode the roster is the only door. Scaling this way also keeps FEED usable for a
single-administrator pantry that never leaves Domain mode. A revoked
Administrator holds a role they cannot use and does not count toward either
minimum.

"Primary" and "alternate" are operational convention, not schema — enforcement
counts eligible administrators. A true break-glass account (a dedicated,
rarely-used address that does not share a working mailbox's phishing surface)
is a separate operational choice.

## Access policy

Sign-in is governed by an organization-wide `AccessPolicy`:

- **Domain mode** — any address on the organization domain whose access is not
  revoked. This is FEED's historical behaviour and the shipped default.
- **Allowlist mode** — only an existing, non-revoked roster row. Strictly
  narrower than Domain mode: a mode switch can never widen access.

`accessState = REVOKED` blocks sign-in under **both** modes. This is what makes
removing a departed staff member durable; deletion alone is not, because
`findOrCreateUser` recreates the row on their next successful verification.

Both modes are enforced at all four entry points — magic-link request,
magic-link callback, OTP request, and OTP verify — and re-checked at verify so
a code or link issued before a revocation does not still resolve.

Authority is read from the database on **every authenticated request**, not
from the JWT. A seven-day token would otherwise make revocation advisory: the
person whose access was just removed would keep working until it expired.

The implementation should add an auditable role assignment model rather than a
client-only flag. Administrator actions should record actor, target, action,
and timestamp. User identity is still never used to scope shared inventory,
translations, templates, procurement, or analytics data.

## Admin surface

Shipped in 1.5.0-beta.4 at `/admin`, in three tabs:

- **Staff** — the roster: invite, promote, demote, revoke, restore, remove, and
  last sign-in;
- **Sign-in** — access mode, the message shown to anyone turned away, and the
  contact address;
- **History** — privileged-action audit records.

Still deferred:

- initialize or rotate encryption;
- configure fresh AI provider keys after a sanitized restore;
- generate and restore sanitized in-app backups (ISSUES.md #50b).

Until those exist, database recovery remains an operator-controlled deployment
task.

beta.4 deliberately did **not** put existing privileged routes (procurement
rollback and restore, AI configuration, data-shaping rules) behind
`requireAdmin`. Between the migration and a verified roster the authorization
state is unproven, and gating them in the same release would risk removing
capability the pantry depends on with no in-app way to restore it. That
tightening is beta.5 work.
