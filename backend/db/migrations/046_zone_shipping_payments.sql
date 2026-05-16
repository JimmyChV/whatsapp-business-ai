ALTER TABLE tenant_zone_rules
  ADD COLUMN IF NOT EXISTS shipping_options JSONB
    NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS payment_methods JSONB
    NOT NULL DEFAULT '{}';
