-- 022_chat_commercial_status.sql
-- Estado comercial por chat para pipeline comercial.

BEGIN;

CREATE TABLE IF NOT EXISTS tenant_chat_commercial_status (
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    chat_id TEXT NOT NULL,
    scope_module_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'nuevo'
        CHECK (status IN ('nuevo', 'en_conversacion', 'cotizado', 'vendido', 'perdido')),
    source TEXT NOT NULL DEFAULT 'system'
        CHECK (source IN ('system', 'manual', 'automation', 'campaign')),
    reason TEXT NULL,
    changed_by_user_id TEXT NULL REFERENCES users(user_id) ON DELETE SET NULL,
    first_customer_message_at TIMESTAMPTZ NULL,
    first_agent_response_at TIMESTAMPTZ NULL,
    quoted_at TIMESTAMPTZ NULL,
    sold_at TIMESTAMPTZ NULL,
    lost_at TIMESTAMPTZ NULL,
    last_transition_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, chat_id, scope_module_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_commercial_status_tenant_status
    ON tenant_chat_commercial_status(tenant_id, scope_module_id, status, updated_at DESC);

COMMIT;
