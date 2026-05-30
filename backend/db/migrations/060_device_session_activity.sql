-- Track user activity separately from device presence for desktop inactivity rules.
-- Safe to run multiple times.

ALTER TABLE auth_device_sessions
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_auth_device_sessions_desktop_activity
  ON auth_device_sessions(device_type, last_activity_at, revoked_at);
