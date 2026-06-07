ALTER TABLE tenant_meta_ads_creatives
  ADD COLUMN IF NOT EXISTS is_external BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS external_channel TEXT;

CREATE TABLE IF NOT EXISTS tenant_meta_ads_external_sales (
  tenant_id TEXT NOT NULL,
  sale_id TEXT NOT NULL DEFAULT 'EXT-' || UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 8)),
  ad_id TEXT NOT NULL,
  sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(10,2) NOT NULL,
  detail TEXT,
  customer_id TEXT,
  phone TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tenant_id, sale_id)
);

CREATE INDEX IF NOT EXISTS idx_ext_sales_ad
  ON tenant_meta_ads_external_sales(tenant_id, ad_id);
