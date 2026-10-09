-- 002: Spanish language support + conversation transcripts.
-- Widens language CHECKs from ('en','vi') to ('en','vi','es'), and adds a
-- per-turn transcript table so staff can review the actual conversation.

ALTER TABLE service_requests
  DROP CONSTRAINT IF EXISTS service_requests_preferred_language_check;
ALTER TABLE service_requests
  ADD CONSTRAINT service_requests_preferred_language_check
  CHECK (preferred_language IN ('en','vi','es'));

ALTER TABLE assistance_cases
  DROP CONSTRAINT IF EXISTS assistance_cases_preferred_language_check;
ALTER TABLE assistance_cases
  ADD CONSTRAINT assistance_cases_preferred_language_check
  CHECK (preferred_language IN ('en','vi','es'));

ALTER TABLE conversation_sessions
  DROP CONSTRAINT IF EXISTS conversation_sessions_language_check;
ALTER TABLE conversation_sessions
  ADD CONSTRAINT conversation_sessions_language_check
  CHECK (language IN ('en','vi','es'));

CREATE TABLE IF NOT EXISTS conversation_turns (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
  turn_index  INTEGER NOT NULL,
  step        TEXT NOT NULL,
  input       TEXT,
  reply       TEXT NOT NULL,
  language    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conversation_turns_session
  ON conversation_turns(session_id, turn_index);

-- Outbox: allow SMS receipt jobs.
ALTER TABLE outbox_jobs
  DROP CONSTRAINT IF EXISTS outbox_jobs_kind_check;
ALTER TABLE outbox_jobs
  ADD CONSTRAINT outbox_jobs_kind_check
  CHECK (kind IN ('approved_update','followup_reminder','sms_receipt'));

ALTER TABLE outbox_jobs
  DROP CONSTRAINT IF EXISTS outbox_jobs_channel_check;
ALTER TABLE outbox_jobs
  ADD CONSTRAINT outbox_jobs_channel_check
  CHECK (channel IN ('voice_callback','status_link','none','sms'));
