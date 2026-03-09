-- SaaS schema v5: WA modules (multi-number per tenant)
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS wa_modules (
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    module_id TEXT NOT NULL,
    module_name TEXT NOT NULL,
    phone_number TEXT,
    transport_mode TEXT NOT NULL DEFAULT 'webjs',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_selected BOOLEAN NOT NULL DEFAULT FALSE,
    assigned_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_wa_modules_tenant_default
    ON wa_modules(tenant_id, is_default DESC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_wa_modules_tenant_selected
    ON wa_modules(tenant_id, is_selected DESC, updated_at DESC);
