CREATE TABLE IF NOT EXISTS tenant_meta_ads_structure (
  id           SERIAL PRIMARY KEY,
  tenant_id    TEXT NOT NULL,
  object_type  TEXT NOT NULL,
  object_id    TEXT NOT NULL,
  object_name  TEXT,
  parent_id    TEXT,
  status       TEXT,
  synced_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, object_id)
);

CREATE TABLE IF NOT EXISTS tenant_meta_ads_insights (
  id          SERIAL PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  object_id   TEXT NOT NULL,
  object_type TEXT NOT NULL,
  date_start  DATE NOT NULL,
  date_stop   DATE NOT NULL,
  spend       NUMERIC(12,2),
  impressions INTEGER,
  reach       INTEGER,
  clicks      INTEGER,
  ctr         NUMERIC(8,4),
  cpc         NUMERIC(10,4),
  cpm         NUMERIC(10,4),
  cpp         NUMERIC(10,4),
  frequency   NUMERIC(8,4),
  actions     JSONB,
  synced_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, object_id, date_start, date_stop)
);

CREATE INDEX IF NOT EXISTS idx_tenant_meta_ads_structure_tenant_type
  ON tenant_meta_ads_structure(tenant_id, object_type);

CREATE INDEX IF NOT EXISTS idx_tenant_meta_ads_insights_tenant_type_dates
  ON tenant_meta_ads_insights(tenant_id, object_type, date_start, date_stop);
