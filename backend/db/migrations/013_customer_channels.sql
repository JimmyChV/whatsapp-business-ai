-- SaaS schema v13: customer channel identities + channel event timeline
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS tenant_customer_identities (
    tenant_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    channel_type TEXT NOT NULL,
    channel_identity TEXT NOT NULL,
    normalized_phone TEXT NULL,
    module_id TEXT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, channel_type, channel_identity),
    FOREIGN KEY (tenant_id, customer_id)
        REFERENCES tenant_customers(tenant_id, customer_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_customer_identities_tenant_customer
    ON tenant_customer_identities(tenant_id, customer_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_identities_tenant_phone
    ON tenant_customer_identities(tenant_id, normalized_phone)
    WHERE normalized_phone IS NOT NULL AND normalized_phone <> '';

CREATE TABLE IF NOT EXISTS tenant_channel_events (
    tenant_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    channel_type TEXT NOT NULL DEFAULT 'whatsapp',
    module_id TEXT NULL,
    customer_id TEXT NULL,
    chat_id TEXT NULL,
    message_id TEXT NULL,
    direction TEXT NOT NULL DEFAULT 'inbound',
    status TEXT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_events_tenant_created
    ON tenant_channel_events(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_channel_events_tenant_module
    ON tenant_channel_events(tenant_id, module_id, created_at DESC);
