CREATE TABLE IF NOT EXISTS tenant_device_authorizers (
  id          SERIAL PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  user_id     TEXT,
  email       TEXT NOT NULL,
  name        TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_device_authorizers_tenant
  ON tenant_device_authorizers(tenant_id, is_active);
