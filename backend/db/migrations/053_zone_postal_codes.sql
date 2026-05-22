ALTER TABLE tenant_zone_rules
  ADD COLUMN IF NOT EXISTS woo_zone_id INTEGER NULL,
  ADD COLUMN IF NOT EXISTS postal_codes JSONB
    NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ubigeo_codes JSONB
    NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS segment_key TEXT NULL,
  ADD COLUMN IF NOT EXISTS agencies_config JSONB
    NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_zone_rules_segment
  ON tenant_zone_rules(tenant_id, segment_key)
  WHERE segment_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_zone_rules_woo
  ON tenant_zone_rules(tenant_id, woo_zone_id)
  WHERE woo_zone_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_zone_postal_codes_gin
  ON tenant_zone_rules USING GIN (postal_codes);

CREATE INDEX IF NOT EXISTS idx_zone_ubigeo_gin
  ON tenant_zone_rules USING GIN (ubigeo_codes);
