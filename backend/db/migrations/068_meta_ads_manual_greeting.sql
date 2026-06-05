ALTER TABLE IF EXISTS tenant_meta_ads_creatives
  ADD COLUMN IF NOT EXISTS is_manual_greeting BOOLEAN DEFAULT FALSE;

ALTER TABLE IF EXISTS tenant_meta_ads_creatives
  ADD COLUMN IF NOT EXISTS auto_greeting_text TEXT;
