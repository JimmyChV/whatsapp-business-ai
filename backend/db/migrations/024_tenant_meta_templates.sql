-- 024_tenant_meta_templates.sql
-- Catalogo local de templates Meta por tenant/modulo para CRUD, sync y reconciliacion webhook.

BEGIN;

CREATE TABLE IF NOT EXISTS tenant_meta_templates (
    template_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    scope_module_id TEXT NOT NULL DEFAULT '',
    module_id TEXT NOT NULL,
    waba_id TEXT NOT NULL,
    phone_number_id TEXT NOT NULL,
    meta_template_id TEXT NULL,
    template_name TEXT NOT NULL,
    template_language TEXT NOT NULL DEFAULT 'es',
    category TEXT NOT NULL DEFAULT 'marketing',
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'paused', 'disabled', 'deleted', 'in_appeal')),
    quality_score TEXT NOT NULL DEFAULT 'unknown'
        CHECK (quality_score IN ('unknown', 'green', 'yellow', 'red')),
    rejection_reason TEXT NULL,
    components_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    raw_meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_synced_at TIMESTAMPTZ NULL,
    last_status_event_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_meta_templates_tenant_scope_name_lang_active
    ON tenant_meta_templates(tenant_id, scope_module_id, template_name, template_language)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_meta_templates_tenant_scope_status_updated
    ON tenant_meta_templates(tenant_id, scope_module_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_meta_templates_tenant_scope_updated
    ON tenant_meta_templates(tenant_id, scope_module_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_meta_templates_waba_meta_id
    ON tenant_meta_templates(waba_id, meta_template_id);

CREATE INDEX IF NOT EXISTS idx_meta_templates_tenant_scope_template_name
    ON tenant_meta_templates(tenant_id, scope_module_id, template_name);

CREATE INDEX IF NOT EXISTS idx_meta_templates_components_json_gin
    ON tenant_meta_templates USING GIN (components_json);

COMMIT;
