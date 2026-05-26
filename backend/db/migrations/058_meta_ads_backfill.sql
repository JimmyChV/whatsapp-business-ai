ALTER TABLE tenant_meta_ads_insights
  ADD COLUMN IF NOT EXISTS campaign_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS campaign_name TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS campaign_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS adset_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS adset_name TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS adset_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ad_name TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ad_status TEXT DEFAULT NULL;

CREATE TABLE IF NOT EXISTS tenant_meta_ads_sync_state (
  tenant_id                  TEXT PRIMARY KEY,
  backfill_year              INTEGER,
  backfill_started_at        TIMESTAMPTZ DEFAULT NULL,
  backfill_completed_at      TIMESTAMPTZ DEFAULT NULL,
  backfill_completed_through DATE DEFAULT NULL,
  last_structure_sync_at     TIMESTAMPTZ DEFAULT NULL,
  last_insights_sync_from    DATE DEFAULT NULL,
  last_insights_sync_to      DATE DEFAULT NULL,
  last_insights_sync_at      TIMESTAMPTZ DEFAULT NULL,
  updated_at                 TIMESTAMPTZ DEFAULT NOW()
);
