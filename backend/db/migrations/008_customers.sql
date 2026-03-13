-- 008_customers.sql
-- Registro unificado de clientes por tenant con deduplicacion por telefono.

CREATE TABLE IF NOT EXISTS tenant_customers (
    tenant_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    module_id TEXT NULL,
    contact_name TEXT NULL,
    phone_e164 TEXT NULL,
    phone_alt TEXT NULL,
    email TEXT NULL,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    profile JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_interaction_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, customer_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_customers_phone_unique
    ON tenant_customers(tenant_id, phone_e164)
    WHERE phone_e164 IS NOT NULL AND phone_e164 <> '';

CREATE INDEX IF NOT EXISTS idx_tenant_customers_module
    ON tenant_customers(tenant_id, module_id);

CREATE INDEX IF NOT EXISTS idx_tenant_customers_updated
    ON tenant_customers(tenant_id, updated_at DESC);
