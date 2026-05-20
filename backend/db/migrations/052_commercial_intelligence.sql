CREATE TABLE IF NOT EXISTS tenant_commercial_profiles (
  profile_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL
    REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commercial_profiles_tenant
  ON tenant_commercial_profiles(tenant_id, is_active);
