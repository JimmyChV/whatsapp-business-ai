-- SaaS schema v81: reusable message sequence blocks
-- Safe to run multiple times.

ALTER TABLE IF EXISTS quick_reply_items
    ADD COLUMN IF NOT EXISTS message_blocks JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS tenant_scheduled_messages
    ADD COLUMN IF NOT EXISTS message_blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS failed_block_index INTEGER NULL,
    ADD COLUMN IF NOT EXISTS failed_block_type TEXT NULL;

ALTER TABLE IF EXISTS tenant_schedules
    ADD COLUMN IF NOT EXISTS welcome_message_blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS away_message_blocks JSONB NOT NULL DEFAULT '[]'::jsonb;

