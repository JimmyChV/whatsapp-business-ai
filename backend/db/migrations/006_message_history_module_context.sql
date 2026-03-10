-- SaaS schema v6: direct WhatsApp module/number association in message history
-- Safe to run multiple times.

ALTER TABLE IF EXISTS tenant_messages
    ADD COLUMN IF NOT EXISTS wa_module_id TEXT;

ALTER TABLE IF EXISTS tenant_messages
    ADD COLUMN IF NOT EXISTS wa_phone_number TEXT;

CREATE INDEX IF NOT EXISTS idx_tenant_messages_module_ts
    ON tenant_messages(tenant_id, wa_module_id, timestamp_unix DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_messages_phone_ts
    ON tenant_messages(tenant_id, wa_phone_number, timestamp_unix DESC);
