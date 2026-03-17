-- SaaS schema v14: quick-reply libraries (shared + module scoped) with media support
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS quick_reply_libraries (
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    library_id TEXT NOT NULL,
    library_name TEXT NOT NULL,
    description TEXT,
    is_shared BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 1000,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, library_id)
);

CREATE INDEX IF NOT EXISTS idx_quick_reply_libraries_tenant_active
    ON quick_reply_libraries(tenant_id, is_active DESC, sort_order ASC, created_at DESC);

CREATE TABLE IF NOT EXISTS quick_reply_items (
    tenant_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    library_id TEXT NOT NULL,
    label TEXT NOT NULL,
    body_text TEXT NOT NULL DEFAULT '',
    media_url TEXT,
    media_mime_type TEXT,
    media_file_name TEXT,
    media_size_bytes BIGINT,
    sort_order INTEGER NOT NULL DEFAULT 1000,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, item_id),
    FOREIGN KEY (tenant_id, library_id)
        REFERENCES quick_reply_libraries(tenant_id, library_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quick_reply_items_tenant_library_sort
    ON quick_reply_items(tenant_id, library_id, is_active DESC, sort_order ASC, created_at DESC);

CREATE TABLE IF NOT EXISTS quick_reply_library_modules (
    tenant_id TEXT NOT NULL,
    library_id TEXT NOT NULL,
    module_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, library_id, module_id),
    FOREIGN KEY (tenant_id, library_id)
        REFERENCES quick_reply_libraries(tenant_id, library_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quick_reply_library_modules_tenant_module
    ON quick_reply_library_modules(tenant_id, module_id, library_id);

-- Backfill minimum shared library per tenant.
INSERT INTO quick_reply_libraries (
    tenant_id,
    library_id,
    library_name,
    description,
    is_shared,
    is_active,
    sort_order,
    metadata,
    created_at,
    updated_at
)
SELECT
    t.tenant_id,
    'QRL-SHARED',
    'Compartidas',
    'Respuestas rapidas compartidas para la empresa.',
    TRUE,
    TRUE,
    1,
    '{}'::jsonb,
    NOW(),
    NOW()
FROM tenants t
ON CONFLICT (tenant_id, library_id) DO NOTHING;

-- Backfill legacy quick_replies rows into the shared library if missing.
INSERT INTO quick_reply_items (
    tenant_id,
    item_id,
    library_id,
    label,
    body_text,
    sort_order,
    is_active,
    metadata,
    created_at,
    updated_at
)
SELECT
    qr.tenant_id,
    qr.reply_id,
    'QRL-SHARED',
    qr.label,
    qr.body_text,
    COALESCE(qr.sort_order, 1000),
    TRUE,
    '{}'::jsonb,
    COALESCE(qr.created_at, NOW()),
    COALESCE(qr.updated_at, NOW())
FROM quick_replies qr
ON CONFLICT (tenant_id, item_id) DO NOTHING;
