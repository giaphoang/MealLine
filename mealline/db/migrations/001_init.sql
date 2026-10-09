-- MealLine schema, migration 001.
-- Synthetic demo data only. No live recipient data belongs in these tables.
-- (All hashing/token work happens in Node; no extensions required.)

-- Organizations own cases and staff. Staff can only ever see their own org.
CREATE TABLE organizations (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Staff users. role: 'coordinator' may approve service; 'staff' may view,
-- claim, and record outcomes but never approve.
CREATE TABLE staff_users (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id),
  email         TEXT NOT NULL,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('coordinator', 'staff')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, email)
);

CREATE TABLE staff_sessions (
  id            TEXT PRIMARY KEY,
  token_hash    TEXT NOT NULL UNIQUE,
  staff_user_id TEXT NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Synthetic pantry providers. label marks the demo adapter everywhere.
CREATE TABLE service_providers (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organizations(id),
  name            TEXT NOT NULL,
  label           TEXT NOT NULL DEFAULT 'Demo provider',
  phone_number    TEXT NOT NULL,
  transfer_number TEXT NOT NULL,
  business_hours  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Versioned program rules. Unknown rules -> staff review, never invented eligibility.
CREATE TABLE service_policies (
  id              TEXT PRIMARY KEY,
  provider_id     TEXT NOT NULL REFERENCES service_providers(id),
  version         INTEGER NOT NULL,
  service_area    JSONB NOT NULL,   -- { "zips": ["50309", ...] }
  required_fields JSONB NOT NULL,   -- ["address","household_size","contact_preference"]
  program_rules   JSONB NOT NULL,   -- reviewed, dated rule statements
  source          TEXT NOT NULL,
  reviewed_at     TIMESTAMPTZ NOT NULL,
  effective_from  TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_id, version)
);

-- Candidate delivery windows with finite capacity.
CREATE TABLE delivery_options (
  id                TEXT PRIMARY KEY,
  provider_id       TEXT NOT NULL REFERENCES service_providers(id),
  policy_version    INTEGER NOT NULL,
  label             TEXT NOT NULL,
  window_start      TIMESTAMPTZ NOT NULL,
  window_end        TIMESTAMPTZ NOT NULL,
  capacity_total    INTEGER NOT NULL CHECK (capacity_total >= 0),
  capacity_reserved INTEGER NOT NULL DEFAULT 0 CHECK (capacity_reserved >= 0),
  active            BOOLEAN NOT NULL DEFAULT true,
  note              TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per applicant request. New applicants need no existing record.
CREATE TABLE service_requests (
  id                    TEXT PRIMARY KEY,
  provider_id           TEXT NOT NULL REFERENCES service_providers(id),
  external_reference    TEXT,
  recipient_link        TEXT,
  request_type          TEXT NOT NULL CHECK (request_type IN ('new_delivery','missed_delivery','change')),
  channel               TEXT NOT NULL CHECK (channel IN ('voice','text','sim')),
  preferred_language    TEXT NOT NULL CHECK (preferred_language IN ('en','vi')),
  contact_name          TEXT,
  contact_phone         TEXT,
  contact_preference    TEXT CHECK (contact_preference IN ('callback','status_link')),
  address               JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {raw, street, city, zip}
  household             JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {size, notes}
  availability          JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {days:[], times:[]}
  accommodation_request TEXT,
  original_language_input TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The coordination case. Approval is never fulfillment.
CREATE TABLE assistance_cases (
  id                 TEXT PRIMARY KEY,
  case_number        TEXT NOT NULL UNIQUE,
  org_id             TEXT NOT NULL REFERENCES organizations(id),
  provider_id        TEXT NOT NULL REFERENCES service_providers(id),
  request_id         TEXT NOT NULL REFERENCES service_requests(id),
  type               TEXT NOT NULL CHECK (type IN ('new_delivery','missed_delivery','change')),
  status             TEXT NOT NULL CHECK (status IN (
                        'draft','needs_review','awaiting_followup','approved','fulfilled',
                        'closed_without_service','cancelled')),
  owner_id           TEXT REFERENCES staff_users(id),
  next_action_at     TIMESTAMPTZ,
  stated_need_by     TIMESTAMPTZ,
  verification_status TEXT NOT NULL DEFAULT 'unverified'
                     CHECK (verification_status IN ('unverified','verified','failed')),
  rule_check_result  JSONB NOT NULL DEFAULT '{}'::jsonb,
  preferred_language TEXT NOT NULL CHECK (preferred_language IN ('en','vi')),
  contact_preference TEXT CHECK (contact_preference IN ('callback','status_link')),
  accommodation_request TEXT,
  confirmed_fields   JSONB NOT NULL DEFAULT '{}'::jsonb,
  original_input     TEXT,
  translated_summary TEXT,
  unknowns           JSONB NOT NULL DEFAULT '[]'::jsonb,
  version            INTEGER NOT NULL DEFAULT 1,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cases_org_status ON assistance_cases(org_id, status);
CREATE INDEX idx_cases_next_action ON assistance_cases(next_action_at) WHERE status IN ('awaiting_followup','needs_review');

-- A staff-visible proposal of one delivery option. Never a reservation.
CREATE TABLE delivery_proposals (
  id            TEXT PRIMARY KEY,
  case_id       TEXT NOT NULL REFERENCES assistance_cases(id) ON DELETE CASCADE,
  option_id     TEXT NOT NULL REFERENCES delivery_options(id),
  option_snapshot JSONB NOT NULL,
  rationale     TEXT,
  review_state  TEXT NOT NULL CHECK (review_state IN ('proposed','approved','rejected','stale')),
  proposed_by   TEXT,
  approved_by   TEXT REFERENCES staff_users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A booking exists only after the approval transaction commits.
CREATE TABLE bookings (
  id               TEXT PRIMARY KEY,
  case_id          TEXT NOT NULL REFERENCES assistance_cases(id),
  proposal_id      TEXT NOT NULL REFERENCES delivery_proposals(id),
  option_id        TEXT NOT NULL REFERENCES delivery_options(id),
  idempotency_key  TEXT NOT NULL UNIQUE,
  status           TEXT NOT NULL CHECK (status IN ('confirmed','pending_provider','cancelled')),
  external_booking_id TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only case history.
CREATE TABLE case_events (
  id         TEXT PRIMARY KEY,
  case_id    TEXT NOT NULL REFERENCES assistance_cases(id) ON DELETE CASCADE,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('applicant','staff','system','worker')),
  actor_id   TEXT,
  event_type TEXT NOT NULL,
  detail     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_case ON case_events(case_id, created_at);

-- Durable outbox. Worker claims with leases; restart-safe.
CREATE TABLE outbox_jobs (
  id              TEXT PRIMARY KEY,
  job_key         TEXT NOT NULL UNIQUE,
  case_id         TEXT NOT NULL REFERENCES assistance_cases(id),
  kind            TEXT NOT NULL CHECK (kind IN ('approved_update','followup_reminder')),
  channel         TEXT NOT NULL CHECK (channel IN ('voice_callback','status_link','none')),
  payload         JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','leased','done','failed')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_expires_at TIMESTAMPTZ,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_outbox_due ON outbox_jobs(status, next_attempt_at);

-- Every notification attempt, kept separate from case/fulfillment state.
CREATE TABLE notification_attempts (
  id                 TEXT PRIMARY KEY,
  job_id             TEXT NOT NULL REFERENCES outbox_jobs(id) ON DELETE CASCADE,
  channel            TEXT NOT NULL,
  status             TEXT NOT NULL CHECK (status IN ('attempted','acknowledged','failed')),
  provider_identifier TEXT,
  error              TEXT,
  acknowledged_at    TIMESTAMPTZ,
  detail             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Voice/text conversation sessions. Step is enforced server-side.
CREATE TABLE conversation_sessions (
  id                  TEXT PRIMARY KEY,
  provider_call_id    TEXT UNIQUE,
  channel             TEXT NOT NULL CHECK (channel IN ('voice','text','sim')),
  case_id             TEXT REFERENCES assistance_cases(id),
  step                TEXT NOT NULL,
  language            TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en','vi')),
  draft_fields        JSONB NOT NULL DEFAULT '{}'::jsonb,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','transferred','callback','completed','abandoned')),
  last_input_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- High-entropy applicant status links. Token hashes only; never raw tokens.
CREATE TABLE status_links (
  id          TEXT PRIMARY KEY,
  case_id     TEXT NOT NULL REFERENCES assistance_cases(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
