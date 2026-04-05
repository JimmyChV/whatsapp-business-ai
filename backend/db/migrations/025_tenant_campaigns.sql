-- 025_tenant_campaigns.sql
-- Core schema for mass campaigns: campaign definition, recipients and event traceability.

BEGIN;

CREATE TABLE IF NOT EXISTS tenant_campaigns (
    campaign_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    scope_module_id TEXT NOT NULL DEFAULT '',
    module_id TEXT NOT NULL,
    template_id TEXT NULL,
    template_name TEXT NOT NULL,
    template_language TEXT NOT NULL DEFAULT 'es',
    campaign_name TEXT NOT NULL,
    campaign_description TEXT NULL,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled', 'failed')),
    audience_filters_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    variables_preview_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    total_recipients INTEGER NOT NULL DEFAULT 0,
    pending_recipients INTEGER NOT NULL DEFAULT 0,
    claimed_recipients INTEGER NOT NULL DEFAULT 0,
    sent_recipients INTEGER NOT NULL DEFAULT 0,
    failed_recipients INTEGER NOT NULL DEFAULT 0,
    skipped_recipients INTEGER NOT NULL DEFAULT 0,
    scheduled_at TIMESTAMPTZ NULL,
    started_at TIMESTAMPTZ NULL,
    completed_at TIMESTAMPTZ NULL,
    cancelled_at TIMESTAMPTZ NULL,
    created_by TEXT NULL,
    updated_by TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_campaigns_tenant_status_created
    ON tenant_campaigns(tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_campaigns_tenant_module_status
    ON tenant_campaigns(tenant_id, module_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_campaigns_tenant_scope_status
    ON tenant_campaigns(tenant_id, scope_module_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_campaigns_tenant_scheduled
    ON tenant_campaigns(tenant_id, status, scheduled_at)
    WHERE scheduled_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_campaigns_tenant_template
    ON tenant_campaigns(tenant_id, template_name, template_language, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_campaigns_filters_gin
    ON tenant_campaigns USING GIN (audience_filters_json);

CREATE TABLE IF NOT EXISTS tenant_campaign_recipients (
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    campaign_id TEXT NOT NULL,
    recipient_id TEXT NOT NULL,
    customer_id TEXT NULL,
    phone TEXT NOT NULL,
    module_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'claimed', 'sent', 'failed', 'skipped', 'opted_out')),
    idempotency_key TEXT NOT NULL,
    variables_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    claimed_at TIMESTAMPTZ NULL,
    sent_at TIMESTAMPTZ NULL,
    delivered_at TIMESTAMPTZ NULL,
    read_at TIMESTAMPTZ NULL,
    failed_at TIMESTAMPTZ NULL,
    skipped_at TIMESTAMPTZ NULL,
    last_error TEXT NULL,
    skip_reason TEXT NULL,
    meta_message_id TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, campaign_id, recipient_id),
    UNIQUE (tenant_id, idempotency_key),
    FOREIGN KEY (tenant_id, campaign_id)
        REFERENCES tenant_campaigns(tenant_id, campaign_id)
        ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_campaign_recipients_unique_phone
    ON tenant_campaign_recipients(tenant_id, campaign_id, phone);

CREATE INDEX IF NOT EXISTS idx_tenant_campaign_recipients_status
    ON tenant_campaign_recipients(tenant_id, campaign_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_campaign_recipients_dispatch
    ON tenant_campaign_recipients(tenant_id, status, next_attempt_at, created_at);

CREATE INDEX IF NOT EXISTS idx_tenant_campaign_recipients_customer
    ON tenant_campaign_recipients(tenant_id, customer_id, created_at DESC)
    WHERE customer_id IS NOT NULL AND customer_id <> '';

CREATE INDEX IF NOT EXISTS idx_tenant_campaign_recipients_module
    ON tenant_campaign_recipients(tenant_id, module_id, status, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_tenant_campaign_recipients_meta_message
    ON tenant_campaign_recipients(tenant_id, meta_message_id)
    WHERE meta_message_id IS NOT NULL AND meta_message_id <> '';

CREATE TABLE IF NOT EXISTS tenant_campaign_events (
    event_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    campaign_id TEXT NOT NULL,
    recipient_id TEXT NULL,
    customer_id TEXT NULL,
    phone TEXT NULL,
    module_id TEXT NULL,
    event_type TEXT NOT NULL CHECK (
        event_type IN (
            'campaign_created',
            'campaign_updated',
            'campaign_started',
            'campaign_paused',
            'campaign_resumed',
            'campaign_cancelled',
            'campaign_completed',
            'recipient_queued',
            'recipient_claimed',
            'recipient_sent',
            'recipient_failed',
            'recipient_skipped',
            'recipient_delivered',
            'recipient_read'
        )
    ),
    severity TEXT NOT NULL DEFAULT 'info'
        CHECK (severity IN ('info', 'warn', 'error')),
    actor_type TEXT NOT NULL DEFAULT 'system'
        CHECK (actor_type IN ('system', 'user', 'worker', 'webhook')),
    actor_id TEXT NULL,
    reason TEXT NULL,
    message TEXT NULL,
    payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, event_id),
    FOREIGN KEY (tenant_id, campaign_id)
        REFERENCES tenant_campaigns(tenant_id, campaign_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tenant_campaign_events_campaign
    ON tenant_campaign_events(tenant_id, campaign_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_campaign_events_type
    ON tenant_campaign_events(tenant_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_campaign_events_recipient
    ON tenant_campaign_events(tenant_id, campaign_id, recipient_id, created_at DESC)
    WHERE recipient_id IS NOT NULL AND recipient_id <> '';

CREATE INDEX IF NOT EXISTS idx_tenant_campaign_events_severity
    ON tenant_campaign_events(tenant_id, severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_campaign_events_payload_gin
    ON tenant_campaign_events USING GIN (payload_json);

COMMIT;

