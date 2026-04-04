BEGIN;

CREATE TABLE IF NOT EXISTS tenant_customer_module_contexts (
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL,
    module_id TEXT NOT NULL,
    marketing_opt_in_status TEXT NOT NULL DEFAULT 'unknown'
        CHECK (marketing_opt_in_status IN ('unknown', 'opted_in', 'opted_out')),
    marketing_opt_in_updated_at TIMESTAMPTZ NULL,
    marketing_opt_in_source TEXT NULL,
    commercial_status TEXT NOT NULL DEFAULT 'unknown'
        CHECK (commercial_status IN ('nuevo', 'en_conversacion', 'cotizado', 'vendido', 'perdido', 'unknown')),
    labels JSONB NOT NULL DEFAULT '[]'::jsonb,
    assignment_user_id TEXT NULL,
    first_interaction_at TIMESTAMPTZ NULL,
    last_interaction_at TIMESTAMPTZ NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, customer_id, module_id),
    FOREIGN KEY (tenant_id, customer_id)
        REFERENCES tenant_customers(tenant_id, customer_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tenant_customer_module_ctx_marketing
    ON tenant_customer_module_contexts(tenant_id, module_id, marketing_opt_in_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_customer_module_ctx_commercial
    ON tenant_customer_module_contexts(tenant_id, module_id, commercial_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_customer_module_ctx_customer
    ON tenant_customer_module_contexts(tenant_id, customer_id, updated_at DESC);

INSERT INTO tenant_customer_module_contexts (
    tenant_id,
    customer_id,
    module_id,
    marketing_opt_in_status,
    marketing_opt_in_updated_at,
    marketing_opt_in_source,
    first_interaction_at,
    last_interaction_at,
    metadata,
    created_at,
    updated_at
)
SELECT
    tc.tenant_id,
    tc.customer_id,
    tc.module_id,
    CASE
        WHEN LOWER(COALESCE(tc.marketing_opt_in_status, 'unknown')) IN ('opted_in', 'opted_out', 'unknown')
            THEN LOWER(COALESCE(tc.marketing_opt_in_status, 'unknown'))
        ELSE 'unknown'
    END AS marketing_opt_in_status,
    tc.marketing_opt_in_updated_at,
    tc.marketing_opt_in_source,
    COALESCE(tc.last_interaction_at, tc.created_at, tc.updated_at, NOW()) AS first_interaction_at,
    COALESCE(tc.last_interaction_at, tc.updated_at, tc.created_at, NOW()) AS last_interaction_at,
    '{}'::jsonb AS metadata,
    COALESCE(tc.created_at, NOW()) AS created_at,
    COALESCE(tc.updated_at, NOW()) AS updated_at
FROM tenant_customers tc
WHERE COALESCE(BTRIM(tc.module_id), '') <> ''
ON CONFLICT (tenant_id, customer_id, module_id)
DO UPDATE SET
    marketing_opt_in_status = EXCLUDED.marketing_opt_in_status,
    marketing_opt_in_updated_at = EXCLUDED.marketing_opt_in_updated_at,
    marketing_opt_in_source = EXCLUDED.marketing_opt_in_source,
    first_interaction_at = COALESCE(tenant_customer_module_contexts.first_interaction_at, EXCLUDED.first_interaction_at),
    last_interaction_at = GREATEST(
        COALESCE(tenant_customer_module_contexts.last_interaction_at, EXCLUDED.last_interaction_at),
        COALESCE(EXCLUDED.last_interaction_at, tenant_customer_module_contexts.last_interaction_at)
    ),
    updated_at = GREATEST(
        COALESCE(tenant_customer_module_contexts.updated_at, EXCLUDED.updated_at),
        COALESCE(EXCLUDED.updated_at, tenant_customer_module_contexts.updated_at)
    );

COMMIT;
