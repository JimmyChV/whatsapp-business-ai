-- Contacts excluded from operational reports because they are internal/test numbers.
CREATE TABLE IF NOT EXISTS tenant_test_contacts (
  tenant_id TEXT NOT NULL,
  phone_e164 TEXT NOT NULL,
  label TEXT,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tenant_id, phone_e164)
);

CREATE INDEX IF NOT EXISTS idx_tenant_test_contacts_tenant
  ON tenant_test_contacts (tenant_id, added_at DESC);
