-- SaaS schema v12: control-plane hardening and schema alignment
-- Safe to run multiple times.

ALTER TABLE IF EXISTS tenants
    ADD COLUMN IF NOT EXISTS logo_url TEXT;

ALTER TABLE IF EXISTS tenants
    ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

ALTER TABLE IF EXISTS tenants
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS users
    ADD COLUMN IF NOT EXISTS avatar_url TEXT;

ALTER TABLE IF EXISTS users
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS catalog_items
    ADD COLUMN IF NOT EXISTS module_id TEXT;

ALTER TABLE IF EXISTS catalog_items
    ADD COLUMN IF NOT EXISTS catalog_id TEXT;

ALTER TABLE IF EXISTS catalog_items
    ADD COLUMN IF NOT EXISTS channel_type TEXT;

ALTER TABLE IF EXISTS catalog_items
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'local';

ALTER TABLE IF EXISTS catalog_items
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE catalog_items
   SET module_id = ''
 WHERE module_id IS NULL;

UPDATE catalog_items
   SET catalog_id = ''
 WHERE catalog_id IS NULL;

UPDATE catalog_items
   SET source = 'local'
 WHERE source IS NULL OR source = '';

UPDATE catalog_items
   SET metadata = '{}'::jsonb
 WHERE metadata IS NULL;

ALTER TABLE IF EXISTS catalog_items
    ALTER COLUMN module_id SET DEFAULT '';

ALTER TABLE IF EXISTS catalog_items
    ALTER COLUMN catalog_id SET DEFAULT '';

ALTER TABLE IF EXISTS catalog_items
    ALTER COLUMN module_id SET NOT NULL;

ALTER TABLE IF EXISTS catalog_items
    ALTER COLUMN catalog_id SET NOT NULL;

ALTER TABLE IF EXISTS catalog_items
    ALTER COLUMN source SET DEFAULT 'local';

ALTER TABLE IF EXISTS catalog_items
    ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS catalog_items
    ALTER COLUMN metadata SET NOT NULL;

DO $$
BEGIN
    IF to_regclass('catalog_items') IS NULL THEN
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'catalog_items_pkey'
           AND conrelid = to_regclass('catalog_items')
    )
    AND NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'catalog_items_pkey'
           AND conrelid = to_regclass('catalog_items')
           AND cardinality(conkey) = 4
    ) THEN
        ALTER TABLE catalog_items DROP CONSTRAINT catalog_items_pkey;
        ALTER TABLE catalog_items
            ADD CONSTRAINT catalog_items_pkey PRIMARY KEY (tenant_id, item_id, module_id, catalog_id);
    ELSIF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'catalog_items_pkey'
           AND conrelid = to_regclass('catalog_items')
    ) THEN
        ALTER TABLE catalog_items
            ADD CONSTRAINT catalog_items_pkey PRIMARY KEY (tenant_id, item_id, module_id, catalog_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_catalog_items_tenant_module_catalog_created
    ON catalog_items(tenant_id, module_id, catalog_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tenant_catalogs (
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    catalog_id TEXT NOT NULL,
    catalog_name TEXT NOT NULL,
    description TEXT,
    source_type TEXT NOT NULL DEFAULT 'local',
    config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, catalog_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_catalogs_tenant_active
    ON tenant_catalogs(tenant_id, is_active DESC, is_default DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS tenant_integrations (
    tenant_id TEXT PRIMARY KEY REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saas_access_catalog (
    scope TEXT PRIMARY KEY,
    catalog_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saas_plan_limits (
    scope TEXT PRIMARY KEY,
    limits_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_ai_usage (
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    month_key TEXT NOT NULL,
    requests BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, month_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_ai_usage_tenant_updated
    ON tenant_ai_usage(tenant_id, updated_at DESC);
