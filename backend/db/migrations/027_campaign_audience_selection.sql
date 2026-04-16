BEGIN;

ALTER TABLE tenant_campaigns
    ADD COLUMN IF NOT EXISTS audience_selection_json JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMIT;
