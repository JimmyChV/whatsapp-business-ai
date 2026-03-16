-- SaaS schema v11: persistent AI copilot chat history per scoped chat
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS tenant_ai_chat_history (
    tenant_id TEXT NOT NULL,
    entry_id TEXT NOT NULL,
    scope_chat_id TEXT NOT NULL,
    base_chat_id TEXT NULL,
    scope_module_id TEXT NULL,
    mode TEXT NOT NULL DEFAULT 'copilot',
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    assistant_id TEXT NULL,
    user_id TEXT NULL,
    user_name TEXT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at_unix BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, entry_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_history_tenant_scope_created
    ON tenant_ai_chat_history(tenant_id, scope_chat_id, created_at_unix DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_chat_history_tenant_module_created
    ON tenant_ai_chat_history(tenant_id, scope_module_id, created_at_unix DESC, created_at DESC);
