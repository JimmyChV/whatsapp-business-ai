-- SaaS schema v55: numbered quotes and revisions per chat

ALTER TABLE tenant_quotes
    ADD COLUMN IF NOT EXISTS quote_number INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS revision_number INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS parent_quote_id TEXT NULL;

-- Existing rows received quote_number = 1 by default. Backfill stable numbers
-- before enforcing one root quote per chat/number.
WITH ranked AS (
    SELECT
        tenant_id,
        quote_id,
        ROW_NUMBER() OVER (
            PARTITION BY tenant_id, chat_id
            ORDER BY COALESCE(sent_at, created_at), created_at, quote_id
        ) AS rn
    FROM tenant_quotes
    WHERE parent_quote_id IS NULL
)
UPDATE tenant_quotes q
SET quote_number = ranked.rn
FROM ranked
WHERE q.tenant_id = ranked.tenant_id
  AND q.quote_id = ranked.quote_id
  AND q.parent_quote_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_quotes_quote_id
    ON tenant_quotes(quote_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_tenant_quotes_parent_quote'
    ) THEN
        ALTER TABLE tenant_quotes
            ADD CONSTRAINT fk_tenant_quotes_parent_quote
            FOREIGN KEY (parent_quote_id)
            REFERENCES tenant_quotes(quote_id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_quotes_chat_number
    ON tenant_quotes(tenant_id, chat_id, quote_number);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_chat_number_unique
    ON tenant_quotes(tenant_id, chat_id, quote_number)
    WHERE parent_quote_id IS NULL;
