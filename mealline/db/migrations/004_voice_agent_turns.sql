-- Durable replay receipts for the Pipecat adapter; no case/approval changes.
CREATE TABLE voice_agent_turns (
  session_id TEXT NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  input_hash TEXT NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, request_id)
);
