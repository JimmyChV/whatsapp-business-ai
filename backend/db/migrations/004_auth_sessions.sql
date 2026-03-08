-- SaaS schema v4: auth sessions + token revocations
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS auth_sessions (
    session_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    user_email TEXT,
    role TEXT NOT NULL DEFAULT 'seller',
    refresh_token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    replaced_by_session_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_tenant_user
    ON auth_sessions(tenant_id, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_active
    ON auth_sessions(tenant_id, revoked_at, expires_at DESC);

CREATE TABLE IF NOT EXISTS auth_token_revocations (
    id BIGSERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    token_jti TEXT,
    user_id TEXT,
    reason TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_token_revocations_tenant_jti
    ON auth_token_revocations(tenant_id, token_jti);

CREATE INDEX IF NOT EXISTS idx_auth_token_revocations_expires
    ON auth_token_revocations(expires_at DESC);
