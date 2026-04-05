BEGIN;

CREATE TABLE IF NOT EXISTS global_customer_treatments (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    label TEXT NOT NULL,
    abbreviation TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS global_customer_types (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (label)
);

CREATE TABLE IF NOT EXISTS global_acquisition_sources (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (label)
);

CREATE TABLE IF NOT EXISTS global_document_types (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    label TEXT NOT NULL,
    abbreviation TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (code)
);

ALTER TABLE IF EXISTS tenant_customers
    ADD COLUMN IF NOT EXISTS treatment_id TEXT NULL
    REFERENCES global_customer_treatments(id);

ALTER TABLE IF EXISTS tenant_customers
    ADD COLUMN IF NOT EXISTS first_name TEXT NULL;

ALTER TABLE IF EXISTS tenant_customers
    ADD COLUMN IF NOT EXISTS last_name_paternal TEXT NULL;

ALTER TABLE IF EXISTS tenant_customers
    ADD COLUMN IF NOT EXISTS last_name_maternal TEXT NULL;

ALTER TABLE IF EXISTS tenant_customers
    ADD COLUMN IF NOT EXISTS document_type_id TEXT NULL
    REFERENCES global_document_types(id);

ALTER TABLE IF EXISTS tenant_customers
    ADD COLUMN IF NOT EXISTS document_number TEXT NULL;

ALTER TABLE IF EXISTS tenant_customers
    ADD COLUMN IF NOT EXISTS customer_type_id TEXT NULL
    REFERENCES global_customer_types(id);

ALTER TABLE IF EXISTS tenant_customers
    ADD COLUMN IF NOT EXISTS acquisition_source_id TEXT NULL
    REFERENCES global_acquisition_sources(id);

ALTER TABLE IF EXISTS tenant_customers
    ADD COLUMN IF NOT EXISTS notes TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_customers_treatment
    ON tenant_customers(tenant_id, treatment_id);

CREATE INDEX IF NOT EXISTS idx_tenant_customers_document
    ON tenant_customers(tenant_id, document_type_id, document_number);

CREATE INDEX IF NOT EXISTS idx_tenant_customers_type
    ON tenant_customers(tenant_id, customer_type_id);

CREATE INDEX IF NOT EXISTS idx_tenant_customers_acquisition_source
    ON tenant_customers(tenant_id, acquisition_source_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_customers_document_unique
    ON tenant_customers(tenant_id, document_type_id, document_number)
    WHERE document_type_id IS NOT NULL
      AND COALESCE(BTRIM(document_number), '') <> '';

CREATE TABLE IF NOT EXISTS tenant_customer_addresses (
    address_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL,
    address_type TEXT NOT NULL DEFAULT 'other'
        CHECK (address_type IN ('fiscal', 'delivery', 'other')),
    street TEXT NULL,
    reference TEXT NULL,
    maps_url TEXT NULL,
    wkt TEXT NULL,
    latitude NUMERIC(10, 7) NULL,
    longitude NUMERIC(10, 7) NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    district_id TEXT NULL,
    district_name TEXT NULL,
    province_name TEXT NULL,
    department_name TEXT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (address_id),
    FOREIGN KEY (tenant_id, customer_id)
        REFERENCES tenant_customers(tenant_id, customer_id)
        ON DELETE CASCADE,
    CONSTRAINT chk_tenant_customer_addresses_latitude
        CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
    CONSTRAINT chk_tenant_customer_addresses_longitude
        CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180))
);

CREATE INDEX IF NOT EXISTS idx_tenant_customer_addresses_customer
    ON tenant_customer_addresses(tenant_id, customer_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_customer_addresses_type
    ON tenant_customer_addresses(tenant_id, address_type, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_customer_addresses_district
    ON tenant_customer_addresses(tenant_id, district_id, updated_at DESC)
    WHERE district_id IS NOT NULL AND district_id <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_customer_addresses_primary_unique
    ON tenant_customer_addresses(tenant_id, customer_id)
    WHERE is_primary = TRUE;

CREATE TABLE IF NOT EXISTS tenant_customer_import_runs (
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    run_id TEXT NOT NULL,
    source_name TEXT NULL,
    source_format TEXT NOT NULL DEFAULT 'csv',
    source_module_id TEXT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    started_at TIMESTAMPTZ NULL,
    finished_at TIMESTAMPTZ NULL,
    total_rows INTEGER NOT NULL DEFAULT 0,
    inserted_rows INTEGER NOT NULL DEFAULT 0,
    updated_rows INTEGER NOT NULL DEFAULT 0,
    skipped_rows INTEGER NOT NULL DEFAULT 0,
    error_rows INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NULL,
    summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, run_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_customer_import_runs_status
    ON tenant_customer_import_runs(tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_customer_import_runs_module
    ON tenant_customer_import_runs(tenant_id, source_module_id, created_at DESC)
    WHERE source_module_id IS NOT NULL AND source_module_id <> '';

CREATE INDEX IF NOT EXISTS idx_tenant_customer_import_runs_finished
    ON tenant_customer_import_runs(tenant_id, finished_at DESC)
    WHERE finished_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS tenant_customer_import_errors (
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    error_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    row_number INTEGER NULL,
    customer_id TEXT NULL,
    phone_e164 TEXT NULL,
    error_code TEXT NULL,
    error_message TEXT NOT NULL,
    raw_row_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, error_id),
    FOREIGN KEY (tenant_id, run_id)
        REFERENCES tenant_customer_import_runs(tenant_id, run_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tenant_customer_import_errors_run
    ON tenant_customer_import_errors(tenant_id, run_id, row_number ASC);

CREATE INDEX IF NOT EXISTS idx_tenant_customer_import_errors_phone
    ON tenant_customer_import_errors(tenant_id, phone_e164, created_at DESC)
    WHERE phone_e164 IS NOT NULL AND phone_e164 <> '';

CREATE INDEX IF NOT EXISTS idx_tenant_customer_import_errors_created
    ON tenant_customer_import_errors(tenant_id, created_at DESC);

COMMIT;
