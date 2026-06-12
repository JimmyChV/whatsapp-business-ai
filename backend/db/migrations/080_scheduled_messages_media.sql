-- SaaS schema v80: scheduled message media payload
-- Safe to run multiple times.

ALTER TABLE IF EXISTS tenant_scheduled_messages
    ADD COLUMN IF NOT EXISTS media_assets JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS media_url TEXT NULL,
    ADD COLUMN IF NOT EXISTS media_mime_type TEXT NULL,
    ADD COLUMN IF NOT EXISTS media_file_name TEXT NULL;
