-- SaaS schema v20: structured quotes persisted per tenant/chat

CREATE TABLE IF NOT EXISTS tenant_quotes (
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    quote_id TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    scope_module_id TEXT NOT NULL DEFAULT '',
    message_id TEXT NULL,
    status TEXT NOT NULL DEFAULT 'sent', -- draft | sent | void
    currency TEXT NOT NULL DEFAULT 'PEN',

    items_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    notes TEXT NULL,

    created_by_user_id TEXT NULL REFERENCES users(user_id) ON DELETE SET NULL,
    updated_by_user_id TEXT NULL REFERENCES users(user_id) ON DELETE SET NULL,
    sent_at TIMESTAMPTZ NULL,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (tenant_id, quote_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_quotes_chat_created
    ON tenant_quotes(tenant_id, chat_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_quotes_scope_created
    ON tenant_quotes(tenant_id, scope_module_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_quotes_status_updated
    ON tenant_quotes(tenant_id, status, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_quotes_message
    ON tenant_quotes(tenant_id, message_id)
    WHERE message_id IS NOT NULL;
