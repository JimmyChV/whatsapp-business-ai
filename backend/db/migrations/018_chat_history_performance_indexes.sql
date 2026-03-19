-- 018_chat_history_performance_indexes.sql
-- Performance indexes for chat list, message pagination and KPI windows.

CREATE INDEX IF NOT EXISTS idx_tenant_chats_updated
    ON tenant_chats(tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_messages_scope_latest_expr
    ON tenant_messages(
        tenant_id,
        chat_id,
        (COALESCE(NULLIF(LOWER(TRIM(wa_module_id)), ''), '__default__')),
        COALESCE(timestamp_unix, 0) DESC,
        created_at DESC
    );

CREATE INDEX IF NOT EXISTS idx_tenant_messages_tenant_ts
    ON tenant_messages(tenant_id, COALESCE(timestamp_unix, 0) DESC, created_at DESC);
