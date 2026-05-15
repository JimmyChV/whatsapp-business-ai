CREATE TABLE IF NOT EXISTS tenant_schedules (
  schedule_id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Lima',
  weekly_hours JSONB NOT NULL DEFAULT '{}',
  holidays JSONB NOT NULL DEFAULT '[]',
  custom_days JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_schedules_tenant
  ON tenant_schedules(tenant_id, is_active);
