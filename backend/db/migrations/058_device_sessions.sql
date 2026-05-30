-- SaaS auth: device registration and OTP verification.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS auth_device_sessions (
  device_id        TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL,
  tenant_id        TEXT,
  device_name      TEXT,
  device_type      TEXT,
  user_agent       TEXT,
  ip_address       TEXT,
  is_approved      BOOLEAN DEFAULT FALSE,
  approved_at      TIMESTAMPTZ,
  approved_by      TEXT,
  last_seen_at     TIMESTAMPTZ DEFAULT NOW(),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  revoked_at       TIMESTAMPTZ,
  revoked_by       TEXT,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS auth_otp_codes (
  otp_id           TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT NOT NULL,
  device_id        TEXT NOT NULL,
  code_hash        TEXT NOT NULL,
  expires_at       TIMESTAMPTZ NOT NULL,
  used_at          TIMESTAMPTZ,
  attempts         INTEGER DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_device_sessions_user
  ON auth_device_sessions(user_id, revoked_at);

CREATE INDEX IF NOT EXISTS idx_auth_otp_codes_device
  ON auth_otp_codes(device_id, expires_at);
