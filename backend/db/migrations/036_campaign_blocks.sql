BEGIN;

ALTER TABLE tenant_campaigns
    ADD COLUMN IF NOT EXISTS blocks_config_json JSONB DEFAULT NULL;

COMMIT;
