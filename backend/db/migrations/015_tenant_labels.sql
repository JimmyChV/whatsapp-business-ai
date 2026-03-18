BEGIN;

CREATE TABLE IF NOT EXISTS tenant_labels (
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    label_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT NOT NULL DEFAULT '#00A884',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 1000,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, label_id)
);

CREATE TABLE IF NOT EXISTS tenant_chat_labels (
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    chat_id TEXT NOT NULL,
    scope_module_id TEXT NOT NULL DEFAULT '',
    label_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, chat_id, scope_module_id, label_id),
    FOREIGN KEY (tenant_id, label_id)
        REFERENCES tenant_labels(tenant_id, label_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tenant_labels_active
    ON tenant_labels(tenant_id, is_active DESC, sort_order ASC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_chat_labels_chat
    ON tenant_chat_labels(tenant_id, chat_id, scope_module_id, created_at DESC);

COMMIT;
