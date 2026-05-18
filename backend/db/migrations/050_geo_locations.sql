CREATE TABLE IF NOT EXISTS geo_locations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('department', 'province', 'district')),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  parent_id TEXT NULL REFERENCES geo_locations(id),
  ubigeo TEXT NULL,
  source TEXT DEFAULT 'erp_csv',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_geo_locations_type_name
  ON geo_locations(type, normalized_name);

CREATE INDEX IF NOT EXISTS idx_geo_locations_parent
  ON geo_locations(parent_id);

CREATE INDEX IF NOT EXISTS idx_geo_locations_ubigeo
  ON geo_locations(ubigeo) WHERE ubigeo IS NOT NULL;
