BEGIN;

CREATE TABLE IF NOT EXISTS global_labels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#00A884',
    description TEXT NULL,
    commercial_status_key TEXT NULL,
    sort_order INTEGER NOT NULL DEFAULT 1000,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS tenant_labels
    ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'operational';

CREATE UNIQUE INDEX IF NOT EXISTS idx_global_labels_commercial_status_key
    ON global_labels(commercial_status_key)
    WHERE commercial_status_key IS NOT NULL
      AND COALESCE(BTRIM(commercial_status_key), '') <> '';

CREATE INDEX IF NOT EXISTS idx_global_labels_active
    ON global_labels(is_active DESC, sort_order ASC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_labels_type_active
    ON tenant_labels(tenant_id, type, is_active DESC, sort_order ASC, created_at DESC);

COMMIT;
