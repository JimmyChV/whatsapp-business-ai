-- SaaS schema v10: scope catalog items by module to allow multiple catalogs per tenant
-- Safe to run multiple times.

ALTER TABLE IF EXISTS catalog_items
    ADD COLUMN IF NOT EXISTS module_id TEXT;

ALTER TABLE IF EXISTS catalog_items
    ADD COLUMN IF NOT EXISTS channel_type TEXT;

UPDATE catalog_items
   SET module_id = ''
 WHERE module_id IS NULL;

ALTER TABLE IF EXISTS catalog_items
    ALTER COLUMN module_id SET DEFAULT '';

ALTER TABLE IF EXISTS catalog_items
    ALTER COLUMN module_id SET NOT NULL;

DO $$
BEGIN
    IF to_regclass('catalog_items') IS NULL THEN
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'catalog_items_pkey'
           AND conrelid = to_regclass('catalog_items')
    )
    AND NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'catalog_items_pkey'
           AND conrelid = to_regclass('catalog_items')
           AND cardinality(conkey) = 3
    ) THEN
        ALTER TABLE catalog_items DROP CONSTRAINT catalog_items_pkey;
        ALTER TABLE catalog_items
            ADD CONSTRAINT catalog_items_pkey PRIMARY KEY (tenant_id, item_id, module_id);
    ELSIF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'catalog_items_pkey'
           AND conrelid = to_regclass('catalog_items')
    ) THEN
        ALTER TABLE catalog_items
            ADD CONSTRAINT catalog_items_pkey PRIMARY KEY (tenant_id, item_id, module_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_catalog_items_tenant_module_created
    ON catalog_items(tenant_id, module_id, created_at DESC);
