CREATE INDEX IF NOT EXISTS idx_tenant_orders_chat_scope_created
    ON tenant_orders(tenant_id, chat_id, scope_module_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_orders_chat_scope_lower
    ON tenant_orders(tenant_id, chat_id, LOWER(COALESCE(scope_module_id, '')), created_at DESC);
