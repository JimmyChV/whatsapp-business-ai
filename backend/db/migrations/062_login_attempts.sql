CREATE TABLE IF NOT EXISTS auth_login_attempts (
  id          SERIAL PRIMARY KEY,
  identifier  TEXT NOT NULL,
  tenant_id   TEXT,
  attempt_at  TIMESTAMPTZ DEFAULT NOW(),
  success     BOOLEAN DEFAULT FALSE,
  ip_address  TEXT
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_identifier
  ON auth_login_attempts(identifier, attempt_at DESC);
