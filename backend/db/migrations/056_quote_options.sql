ALTER TABLE tenant_quotes
  ADD COLUMN IF NOT EXISTS is_option_mode BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS option_number INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS option_group_id TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_quotes_option_group
  ON tenant_quotes(option_group_id)
  WHERE option_group_id IS NOT NULL;
