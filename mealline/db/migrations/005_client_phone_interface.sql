ALTER TABLE conversation_sessions ADD COLUMN phone_state JSONB;
ALTER TABLE assistance_cases ADD COLUMN nourish_managed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE assistance_cases ADD COLUMN nourish_client_id TEXT;
ALTER TABLE assistance_cases ADD COLUMN nourish_intake_id TEXT;
CREATE TABLE nourish_phone_jobs (
  id TEXT PRIMARY KEY, session_id TEXT REFERENCES conversation_sessions(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('sync','notification','verify_callback')),
  payload JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','leased','sent','failed','review')),
  attempts INTEGER NOT NULL DEFAULT 0, due_at TIMESTAMPTZ NOT NULL DEFAULT now(), leased_until TIMESTAMPTZ,
  last_error TEXT, provider_sid TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX nourish_phone_jobs_due ON nourish_phone_jobs(status, due_at);
CREATE TABLE nourish_phone_verifications (
  id TEXT PRIMARY KEY, phone_hash TEXT NOT NULL, client_id TEXT, phone TEXT NOT NULL,
  session_id TEXT REFERENCES conversation_sessions(id) ON DELETE SET NULL,
  provider_sid TEXT, channel TEXT NOT NULL CHECK (channel IN ('sms','call')),
  failed_entries INTEGER NOT NULL DEFAULT 0, locked_until TIMESTAMPTZ, last_sent_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL, verified_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX nourish_phone_verifications_phone ON nourish_phone_verifications(phone_hash, created_at);
CREATE TABLE nourish_phone_cursor (id TEXT PRIMARY KEY, cursor INTEGER NOT NULL DEFAULT 0);
