BEGIN;

CREATE TABLE IF NOT EXISTS tenant_meta_ads_creatives (
  tenant_id        TEXT NOT NULL,
  ad_id            TEXT NOT NULL,
  creative_id      TEXT,
  greeting_text    TEXT,
  autofill_message TEXT,
  buttons_json     JSONB DEFAULT '[]'::jsonb,
  raw_creative     JSONB DEFAULT '{}'::jsonb,
  synced_at        TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tenant_id, ad_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_ads_creatives_tenant
  ON tenant_meta_ads_creatives(tenant_id);

ALTER TABLE IF EXISTS tenant_chat_origins
  ADD COLUMN IF NOT EXISTS origin_source TEXT,
  ADD COLUMN IF NOT EXISTS origin_label TEXT,
  ADD COLUMN IF NOT EXISTS origin_detail JSONB DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS tenant_chat_origins
  DROP CONSTRAINT IF EXISTS tenant_chat_origins_origin_type_check;

ALTER TABLE IF EXISTS tenant_chat_origins
  ADD CONSTRAINT tenant_chat_origins_origin_type_check
  CHECK (origin_type IN ('organic', 'meta_ad', 'campaign', 'inbound'));

COMMIT;
