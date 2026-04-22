BEGIN;

CREATE TABLE IF NOT EXISTS tenant_zone_rules (
    rule_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#00A884',
    rules_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, rule_id)
);

CREATE TABLE IF NOT EXISTS tenant_customer_labels (
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL,
    label_id TEXT NOT NULL,
    address_id TEXT NULL,
    source TEXT NOT NULL DEFAULT 'manual'
        CHECK (source IN ('zone', 'commercial', 'manual')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, customer_id, label_id, source),
    FOREIGN KEY (tenant_id, customer_id)
        REFERENCES tenant_customers(tenant_id, customer_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tenant_zone_rules_active
    ON tenant_zone_rules(tenant_id, is_active DESC, name ASC);

CREATE INDEX IF NOT EXISTS idx_tenant_customer_labels_customer
    ON tenant_customer_labels(tenant_id, customer_id, source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_customer_labels_label
    ON tenant_customer_labels(tenant_id, label_id, source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_customer_labels_address
    ON tenant_customer_labels(tenant_id, address_id)
    WHERE address_id IS NOT NULL;

COMMIT;
