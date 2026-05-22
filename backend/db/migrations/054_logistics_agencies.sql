CREATE TABLE IF NOT EXISTS tenant_logistics_agencies (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  carrier VARCHAR(20) NOT NULL,
  external_id VARCHAR(50) NOT NULL,
  code VARCHAR(50),
  name VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  address TEXT,
  reference_text TEXT,
  phone_primary VARCHAR(100),
  department VARCHAR(100),
  province VARCHAR(100),
  city VARCHAR(100),
  district VARCHAR(100),
  ubigeo VARCHAR(20),
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  hours_week TEXT,
  hours_sunday TEXT,
  hours_delivery TEXT,
  is_main BOOLEAN NOT NULL DEFAULT false,
  is_delivery_enabled BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, carrier, external_id)
);

CREATE INDEX IF NOT EXISTS idx_agencies_tenant_carrier
  ON tenant_logistics_agencies(tenant_id, carrier, is_active);

CREATE INDEX IF NOT EXISTS idx_agencies_coords
  ON tenant_logistics_agencies(latitude, longitude)
  WHERE latitude IS NOT NULL
    AND longitude IS NOT NULL
    AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_agencies_tenant_active
  ON tenant_logistics_agencies(tenant_id, is_active);

CREATE TABLE IF NOT EXISTS tenant_integrations (
  tenant_id TEXT PRIMARY KEY
    REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO tenant_integrations (tenant_id, config_json, updated_at)
SELECT
  t.tenant_id,
  jsonb_build_object('geo', jsonb_build_object('googleMapsApiKey', '')),
  NOW()
FROM tenants t
ON CONFLICT (tenant_id)
DO UPDATE SET
  config_json = jsonb_set(
    COALESCE(tenant_integrations.config_json, '{}'::jsonb),
    '{geo}',
    COALESCE(tenant_integrations.config_json->'geo', '{}'::jsonb)
      || jsonb_build_object(
        'googleMapsApiKey',
        COALESCE(tenant_integrations.config_json#>>'{geo,googleMapsApiKey}', '')
      ),
    true
  ),
  updated_at = NOW();
