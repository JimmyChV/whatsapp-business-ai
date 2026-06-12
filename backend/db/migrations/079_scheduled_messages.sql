-- SaaS schema v79: scheduled chat messages
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS tenant_scheduled_messages (
    message_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    chat_id TEXT NOT NULL,
    scope_module_id TEXT NOT NULL DEFAULT '',
    created_by_user_id TEXT NOT NULL,
    message_text TEXT NOT NULL,
    variables JSONB NOT NULL DEFAULT '{}'::jsonb,
    schedule_type TEXT NOT NULL DEFAULT 'absolute',
    scheduled_for TIMESTAMPTZ NOT NULL,
    minutes_before_window INTEGER NULL,
    window_expires_at_at_schedule TIMESTAMPTZ NULL,
    cancel_on_customer_reply BOOLEAN NOT NULL DEFAULT TRUE,
    last_customer_message_at_schedule TIMESTAMPTZ NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    sent_at TIMESTAMPTZ NULL,
    sent_message_id TEXT NULL,
    cancelled_at TIMESTAMPTZ NULL,
    cancel_reason TEXT NULL,
    failed_at TIMESTAMPTZ NULL,
    fail_reason TEXT NULL,
    processing_started_at TIMESTAMPTZ NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, message_id),
    CHECK (status IN ('pending', 'sent', 'cancelled', 'failed')),
    CHECK (schedule_type IN ('absolute', 'before_window_expiry'))
);

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_pending
ON tenant_scheduled_messages(tenant_id, status, scheduled_for)
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_chat
ON tenant_scheduled_messages(tenant_id, chat_id, scope_module_id, status, scheduled_for DESC);

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_due
ON tenant_scheduled_messages(status, scheduled_for)
WHERE status = 'pending';
