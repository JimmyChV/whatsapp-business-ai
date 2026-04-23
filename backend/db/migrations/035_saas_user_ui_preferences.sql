CREATE TABLE IF NOT EXISTS saas_user_ui_preferences (
    preference_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    tenant_id TEXT,
    section_key TEXT NOT NULL,
    preferences_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, tenant_id, section_key)
);

CREATE INDEX IF NOT EXISTS idx_saas_user_ui_preferences_user
    ON saas_user_ui_preferences(user_id, tenant_id, section_key);
