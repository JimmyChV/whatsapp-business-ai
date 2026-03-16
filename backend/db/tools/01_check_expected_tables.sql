-- Verificacion de esquema esperado (migraciones 001..013)
-- Uso:
--   psql "$DATABASE_URL" -f backend/db/tools/01_check_expected_tables.sql

BEGIN;

CREATE TEMP TABLE _expected_tables (
    table_name TEXT PRIMARY KEY
);

INSERT INTO _expected_tables (table_name) VALUES
('tenants'),
('users'),
('memberships'),
('wa_sessions'),
('quick_replies'),
('catalog_items'),
('audit_logs'),
('tenant_settings'),
('tenant_chats'),
('tenant_messages'),
('auth_sessions'),
('auth_token_revocations'),
('wa_modules'),
('tenant_customers'),
('tenant_customer_identities'),
('tenant_channel_events'),
('tenant_ai_chat_history'),
('tenant_catalogs'),
('tenant_integrations'),
('saas_access_catalog'),
('saas_plan_limits'),
('tenant_ai_usage');

SELECT
    COUNT(*)::INT AS expected_table_count
FROM _expected_tables;

SELECT
    e.table_name AS missing_table
FROM _expected_tables e
LEFT JOIN information_schema.tables t
    ON t.table_schema = 'public'
   AND t.table_name = e.table_name
WHERE t.table_name IS NULL
ORDER BY e.table_name;

SELECT
    t.table_name AS extra_table
FROM information_schema.tables t
LEFT JOIN _expected_tables e
    ON e.table_name = t.table_name
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
  AND e.table_name IS NULL
ORDER BY t.table_name;

CREATE TEMP TABLE _table_counts (
    table_name TEXT PRIMARY KEY,
    exists_in_db BOOLEAN NOT NULL,
    row_count BIGINT
);

DO $$
DECLARE
    r RECORD;
    c BIGINT;
BEGIN
    FOR r IN SELECT table_name FROM _expected_tables ORDER BY table_name LOOP
        IF to_regclass('public.' || r.table_name) IS NULL THEN
            INSERT INTO _table_counts(table_name, exists_in_db, row_count)
            VALUES (r.table_name, FALSE, NULL);
        ELSE
            EXECUTE format('SELECT COUNT(*)::BIGINT FROM %I', r.table_name) INTO c;
            INSERT INTO _table_counts(table_name, exists_in_db, row_count)
            VALUES (r.table_name, TRUE, c);
        END IF;
    END LOOP;
END $$;

SELECT
    table_name,
    exists_in_db,
    row_count
FROM _table_counts
ORDER BY table_name;

COMMIT;
