CREATE TABLE IF NOT EXISTS tenant_orders (
    tenant_id TEXT NOT NULL,
    order_id TEXT NOT NULL DEFAULT 'ORD-' || UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 8)),
    chat_id TEXT NOT NULL,
    customer_id TEXT,
    phone TEXT,
    source_type TEXT NOT NULL
        CHECK (source_type IN ('quote', 'catalog', 'manual')),
    source_id TEXT,
    status TEXT NOT NULL DEFAULT 'aceptado'
        CHECK (status IN (
            'aceptado',
            'programado',
            'atendido',
            'vendido',
            'perdido',
            'cancelado'
        )),
    items_json JSONB DEFAULT '[]'::jsonb,
    subtotal NUMERIC(10,2) DEFAULT 0,
    delivery_amount NUMERIC(10,2) DEFAULT 0,
    discount_amount NUMERIC(10,2) DEFAULT 0,
    total_amount NUMERIC(10,2) DEFAULT 0,
    delivery_type TEXT,
    notes TEXT,
    scheduled_at TIMESTAMPTZ,
    sold_at TIMESTAMPTZ,
    created_by_user_id TEXT,
    assigned_user_id TEXT,
    scope_module_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (tenant_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_orders_chat
    ON tenant_orders(tenant_id, chat_id);

CREATE INDEX IF NOT EXISTS idx_orders_status
    ON tenant_orders(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_orders_created
    ON tenant_orders(tenant_id, created_at);
