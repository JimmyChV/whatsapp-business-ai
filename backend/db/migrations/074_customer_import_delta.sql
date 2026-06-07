ALTER TABLE tenant_customers
  ADD COLUMN IF NOT EXISTS erp_row_hash TEXT,
  ADD COLUMN IF NOT EXISTS erp_last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS erp_last_import_id TEXT,
  ADD COLUMN IF NOT EXISTS erp_source_payload JSONB DEFAULT '{}';

ALTER TABLE tenant_customer_addresses
  ADD COLUMN IF NOT EXISTS erp_address_id TEXT,
  ADD COLUMN IF NOT EXISTS erp_row_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_customers_erp_hash
  ON tenant_customers(tenant_id, erp_row_hash);

CREATE INDEX IF NOT EXISTS idx_addresses_erp_id
  ON tenant_customer_addresses(tenant_id, erp_address_id);
