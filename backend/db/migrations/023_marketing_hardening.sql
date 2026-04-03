BEGIN;

ALTER TABLE IF EXISTS tenant_customers
    ADD COLUMN IF NOT EXISTS preferred_language TEXT NULL DEFAULT 'es';

ALTER TABLE IF EXISTS tenant_customers
    ADD COLUMN IF NOT EXISTS marketing_opt_in_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (marketing_opt_in_status IN ('unknown', 'opted_in', 'opted_out'));

ALTER TABLE IF EXISTS tenant_customers
    ADD COLUMN IF NOT EXISTS marketing_opt_in_updated_at TIMESTAMPTZ NULL;

ALTER TABLE IF EXISTS tenant_customers
    ADD COLUMN IF NOT EXISTS marketing_opt_in_source TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_customers_marketing_opt_in
    ON tenant_customers(tenant_id, marketing_opt_in_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_customers_preferred_language
    ON tenant_customers(tenant_id, preferred_language);

CREATE TABLE IF NOT EXISTS tenant_customer_consents (
    consent_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL,
    consent_type TEXT NOT NULL CHECK (consent_type IN ('marketing', 'transactional')),
    status TEXT NOT NULL CHECK (status IN ('granted', 'revoked')),
    source TEXT NOT NULL CHECK (source IN ('manual', 'import', 'api', 'webhook')),
    proof_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    granted_at TIMESTAMPTZ NULL,
    revoked_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, consent_id),
    FOREIGN KEY (tenant_id, customer_id)
        REFERENCES tenant_customers(tenant_id, customer_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tenant_customer_consents_customer
    ON tenant_customer_consents(tenant_id, customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_customer_consents_status
    ON tenant_customer_consents(tenant_id, consent_type, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_customer_consents_source
    ON tenant_customer_consents(tenant_id, source, created_at DESC);

CREATE TABLE IF NOT EXISTS tenant_chat_origins (
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    chat_id TEXT NOT NULL,
    scope_module_id TEXT NOT NULL DEFAULT '',
    origin_type TEXT NOT NULL CHECK (origin_type IN ('organic', 'meta_ad', 'campaign')),
    referral_source_url TEXT NULL,
    referral_source_type TEXT NULL,
    referral_source_id TEXT NULL,
    referral_headline TEXT NULL,
    ctwa_clid TEXT NULL,
    campaign_id TEXT NULL,
    raw_referral JSONB NOT NULL DEFAULT '{}'::jsonb,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, chat_id, scope_module_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_chat_origins_origin
    ON tenant_chat_origins(tenant_id, origin_type, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_chat_origins_campaign
    ON tenant_chat_origins(tenant_id, campaign_id, detected_at DESC)
    WHERE campaign_id IS NOT NULL AND campaign_id <> '';

CREATE INDEX IF NOT EXISTS idx_tenant_chat_origins_ctwa_clid
    ON tenant_chat_origins(tenant_id, ctwa_clid)
    WHERE ctwa_clid IS NOT NULL AND ctwa_clid <> '';

CREATE TABLE IF NOT EXISTS tenant_template_webhook_events (
    event_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    scope_module_id TEXT NOT NULL DEFAULT '',
    waba_id TEXT NULL,
    template_name TEXT NULL,
    template_id TEXT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('status_update', 'quality_update', 'category_update')),
    previous_status TEXT NULL,
    new_status TEXT NULL,
    reason TEXT NULL,
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_template_webhook_events_type
    ON tenant_template_webhook_events(tenant_id, event_type, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_template_webhook_events_template
    ON tenant_template_webhook_events(tenant_id, template_name, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_template_webhook_events_waba
    ON tenant_template_webhook_events(tenant_id, waba_id, received_at DESC)
    WHERE waba_id IS NOT NULL AND waba_id <> '';

CREATE TABLE IF NOT EXISTS tenant_campaign_queue (
    job_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    campaign_id TEXT NOT NULL,
    recipient_id TEXT NOT NULL,
    phone TEXT NOT NULL,
    module_id TEXT NOT NULL,
    template_name TEXT NOT NULL,
    template_language TEXT NOT NULL,
    variables_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    idempotency_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'sent', 'failed', 'skipped')),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    claimed_at TIMESTAMPTZ NULL,
    claimed_by TEXT NULL,
    last_error TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, job_id),
    UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_campaign_queue_dispatch
    ON tenant_campaign_queue(tenant_id, status, next_attempt_at, created_at);

CREATE INDEX IF NOT EXISTS idx_tenant_campaign_queue_campaign
    ON tenant_campaign_queue(tenant_id, campaign_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_campaign_queue_module
    ON tenant_campaign_queue(tenant_id, module_id, status, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_tenant_campaign_queue_claimed
    ON tenant_campaign_queue(tenant_id, claimed_by, claimed_at DESC)
    WHERE status = 'claimed';

CREATE INDEX IF NOT EXISTS idx_tenant_campaign_queue_phone
    ON tenant_campaign_queue(tenant_id, phone, created_at DESC);

COMMIT;
