-- 017_assignment_rules_and_kpis.sql
-- Reglas de asignacion automatica y soporte de KPIs operativos.

CREATE TABLE IF NOT EXISTS tenant_assignment_rules (
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    scope_module_id TEXT NOT NULL DEFAULT '',
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    mode TEXT NOT NULL DEFAULT 'least_load',
    allowed_roles TEXT[] NOT NULL DEFAULT ARRAY['seller','admin','owner']::text[],
    max_open_chats_per_user INTEGER NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by_user_id TEXT NULL REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, scope_module_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_assignment_rules_enabled
    ON tenant_assignment_rules(tenant_id, enabled, scope_module_id);

CREATE INDEX IF NOT EXISTS idx_tenant_assignment_rules_updated
    ON tenant_assignment_rules(tenant_id, updated_at DESC);