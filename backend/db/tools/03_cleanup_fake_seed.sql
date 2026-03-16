-- Limpieza del seed ficticio de backend/db/tools/02_seed_fake_minimum.sql
-- Uso:
--   psql "$DATABASE_URL" -f backend/db/tools/03_cleanup_fake_seed.sql

BEGIN;

DELETE FROM tenant_customer_identities WHERE tenant_id = 'TEN-DEMO01';
DELETE FROM tenant_channel_events WHERE tenant_id = 'TEN-DEMO01';
DELETE FROM tenant_ai_chat_history WHERE tenant_id = 'TEN-DEMO01';
DELETE FROM tenant_messages WHERE tenant_id = 'TEN-DEMO01';
DELETE FROM tenant_chats WHERE tenant_id = 'TEN-DEMO01';
DELETE FROM tenant_customers WHERE tenant_id = 'TEN-DEMO01';
DELETE FROM tenant_ai_usage WHERE tenant_id = 'TEN-DEMO01';
DELETE FROM auth_sessions WHERE tenant_id = 'TEN-DEMO01';
DELETE FROM auth_token_revocations WHERE tenant_id = 'TEN-DEMO01';
DELETE FROM quick_replies WHERE tenant_id = 'TEN-DEMO01';
DELETE FROM catalog_items WHERE tenant_id = 'TEN-DEMO01';
DELETE FROM tenant_catalogs WHERE tenant_id = 'TEN-DEMO01';
DELETE FROM tenant_integrations WHERE tenant_id = 'TEN-DEMO01';
DELETE FROM wa_modules WHERE tenant_id = 'TEN-DEMO01';
DELETE FROM tenant_settings WHERE tenant_id = 'TEN-DEMO01';
DELETE FROM wa_sessions WHERE tenant_id = 'TEN-DEMO01';
DELETE FROM memberships WHERE tenant_id = 'TEN-DEMO01';
DELETE FROM audit_logs WHERE tenant_id = 'TEN-DEMO01';
DELETE FROM tenants WHERE tenant_id = 'TEN-DEMO01';

DELETE FROM memberships WHERE user_id IN ('USER-DEMO-OWNER', 'USER-DEMO-SELLER');
DELETE FROM users WHERE user_id IN ('USER-DEMO-OWNER', 'USER-DEMO-SELLER');

DELETE FROM saas_access_catalog WHERE scope = 'SEED-DEMO-SCOPE';
DELETE FROM saas_plan_limits WHERE scope = 'SEED-DEMO-SCOPE';

COMMIT;
