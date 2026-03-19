-- SaaS schema v19: quick reply performance indexes for module linkage and list paths

CREATE INDEX IF NOT EXISTS idx_quick_reply_library_modules_tenant_library
    ON quick_reply_library_modules(tenant_id, library_id);

CREATE INDEX IF NOT EXISTS idx_quick_reply_items_tenant_active_updated
    ON quick_reply_items(tenant_id, is_active DESC, updated_at DESC);
