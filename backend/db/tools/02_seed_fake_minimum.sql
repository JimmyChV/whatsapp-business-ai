-- Seed ficticio minimo para validar que las tablas tienen datos.
-- IMPORTANTE: usar solo en entorno de pruebas.
-- Uso:
--   psql "$DATABASE_URL" -f backend/db/tools/02_seed_fake_minimum.sql

BEGIN;

INSERT INTO tenants (tenant_id, slug, name, plan, is_active)
VALUES ('TEN-DEMO01', 'demo-seed', 'Tenant Demo Seed', 'pro', TRUE)
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO users (user_id, email, password_hash, display_name, is_active, metadata)
VALUES
('USER-DEMO-OWNER', 'owner.demo@lavitat.test', 'seed_hash_owner', 'Owner Demo', TRUE, '{"isSuperAdmin": true}'::jsonb),
('USER-DEMO-SELLER', 'seller.demo@lavitat.test', 'seed_hash_seller', 'Seller Demo', TRUE, '{}'::jsonb)
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO memberships (tenant_id, user_id, role, is_active)
VALUES
('TEN-DEMO01', 'USER-DEMO-OWNER', 'owner', TRUE),
('TEN-DEMO01', 'USER-DEMO-SELLER', 'seller', TRUE)
ON CONFLICT (tenant_id, user_id) DO NOTHING;

INSERT INTO wa_sessions (tenant_id, transport_mode, session_state)
VALUES ('TEN-DEMO01', 'cloud', '{"status":"connected","note":"seed"}'::jsonb)
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO tenant_settings (tenant_id, settings_json)
VALUES ('TEN-DEMO01', '{"catalogMode":"hybrid","enabledModules":{"aiPro":true,"catalog":true,"cart":true}}'::jsonb)
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO wa_modules (
    tenant_id, module_id, module_name, phone_number, transport_mode,
    is_active, is_default, is_selected, assigned_user_ids, metadata, channel_type, channel_account_id, channel_label
)
VALUES
('TEN-DEMO01', 'MOD-DEMO-WA1', 'Modulo Demo WhatsApp 1', '+51900000001', 'cloud', TRUE, TRUE, TRUE,
 '["USER-DEMO-OWNER","USER-DEMO-SELLER"]'::jsonb,
 '{"moduleSettings":{"aiAssistantId":"AIA-DEMO-01"}}'::jsonb,
 'whatsapp', 'WABA-DEMO-01', 'Cuenta WA Demo'),
('TEN-DEMO01', 'MOD-DEMO-WA2', 'Modulo Demo WhatsApp 2', '+51900000002', 'cloud', TRUE, FALSE, FALSE,
 '["USER-DEMO-OWNER"]'::jsonb,
 '{"moduleSettings":{"aiAssistantId":"AIA-DEMO-02"}}'::jsonb,
 'whatsapp', 'WABA-DEMO-02', 'Cuenta WA Demo 2')
ON CONFLICT (tenant_id, module_id) DO NOTHING;

INSERT INTO tenant_catalogs (
    tenant_id, catalog_id, catalog_name, description, source_type, config_json, is_active, is_default
)
VALUES
('TEN-DEMO01', 'CAT-DEMO-LOCAL', 'Catalogo Demo Local', 'Catalogo local ficticio', 'local', '{"currency":"PEN"}'::jsonb, TRUE, TRUE),
('TEN-DEMO01', 'CAT-DEMO-WOO', 'Catalogo Demo Woo', 'Catalogo Woo ficticio', 'woocommerce', '{"baseUrl":"https://demo.local"}'::jsonb, TRUE, FALSE)
ON CONFLICT (tenant_id, catalog_id) DO NOTHING;

INSERT INTO catalog_items (
    tenant_id, item_id, title, price, description, image_url, source,
    module_id, catalog_id, channel_type, metadata
)
VALUES
('TEN-DEMO01', 'ITEM-DEMO-001', 'Detergente Demo 1L', '24.90',
 'Producto ficticio para validacion de catalogo local',
 'https://picsum.photos/seed/detergente/600/600', 'local',
 'MOD-DEMO-WA1', 'CAT-DEMO-LOCAL', 'whatsapp', '{"sku":"DET-DEMO-001"}'::jsonb),
('TEN-DEMO01', 'ITEM-DEMO-002', 'Suavizante Demo 1L', '22.90',
 'Producto ficticio para validacion de catalogo woo',
 'https://picsum.photos/seed/suavizante/600/600', 'woocommerce',
 'MOD-DEMO-WA2', 'CAT-DEMO-WOO', 'whatsapp', '{"sku":"SUV-DEMO-002"}'::jsonb)
ON CONFLICT (tenant_id, item_id, module_id, catalog_id) DO NOTHING;

INSERT INTO quick_replies (tenant_id, reply_id, label, body_text, sort_order)
VALUES
('TEN-DEMO01', 'QR-DEMO-001', 'Saludo inicial', 'Hola, gracias por escribir a Lavitat. Te ayudo con gusto.', 10)
ON CONFLICT (tenant_id, reply_id) DO NOTHING;

INSERT INTO tenant_chats (
    tenant_id, chat_id, display_name, phone, subtitle, unread_count, archived, pinned, last_message_id, last_message_at, metadata
)
VALUES
('TEN-DEMO01', 'CHAT-DEMO-0001', 'Cliente Demo', '+51900000001', 'Chat de validacion', 0, FALSE, FALSE,
 'MSG-DEMO-0002', (extract(epoch from now()) * 1000)::bigint,
 '{"scopeModuleId":"MOD-DEMO-WA1"}'::jsonb)
ON CONFLICT (tenant_id, chat_id) DO NOTHING;

INSERT INTO tenant_messages (
    tenant_id, message_id, chat_id, from_me, sender_id, sender_phone, author_id, body,
    message_type, timestamp_unix, ack, edited, has_media, wa_module_id, wa_phone_number, metadata
)
VALUES
('TEN-DEMO01', 'MSG-DEMO-0001', 'CHAT-DEMO-0001', FALSE, 'contact:+51900000001', '+51900000001', NULL,
 'Hola, quiero informacion del detergente.',
 'chat', (extract(epoch from now()) * 1000)::bigint - 60000, NULL, FALSE, FALSE,
 'MOD-DEMO-WA1', '+51900000001', '{"source":"seed"}'::jsonb),
('TEN-DEMO01', 'MSG-DEMO-0002', 'CHAT-DEMO-0001', TRUE, 'USER-DEMO-OWNER', '+51900000001', 'USER-DEMO-OWNER',
 'Claro, te comparto una opcion recomendada.',
 'chat', (extract(epoch from now()) * 1000)::bigint - 30000, 2, FALSE, FALSE,
 'MOD-DEMO-WA1', '+51900000001', '{"source":"seed"}'::jsonb)
ON CONFLICT (tenant_id, message_id) DO NOTHING;

INSERT INTO tenant_customers (
    tenant_id, customer_id, module_id, contact_name, phone_e164, email, tags, profile, metadata, is_active, last_interaction_at
)
VALUES
('TEN-DEMO01', 'CUS-DEMO-0001', 'MOD-DEMO-WA1', 'Cliente Demo', '+51900000001', 'cliente.demo@test.com',
 '["nuevo","demo"]'::jsonb,
 '{"documentType":"DNI","documentNumber":"00000000"}'::jsonb,
 '{"source":"seed"}'::jsonb, TRUE, NOW())
ON CONFLICT (tenant_id, customer_id) DO NOTHING;

INSERT INTO tenant_customer_identities (
    tenant_id, customer_id, channel_type, channel_identity, normalized_phone, module_id, metadata
)
VALUES
('TEN-DEMO01', 'CUS-DEMO-0001', 'whatsapp', '+51900000001', '51900000001', 'MOD-DEMO-WA1', '{"verified":true}'::jsonb)
ON CONFLICT (tenant_id, channel_type, channel_identity) DO NOTHING;

INSERT INTO tenant_channel_events (
    tenant_id, event_id, channel_type, module_id, customer_id, chat_id, message_id,
    direction, status, payload
)
VALUES
('TEN-DEMO01', 'EVT-DEMO-0001', 'whatsapp', 'MOD-DEMO-WA1', 'CUS-DEMO-0001', 'CHAT-DEMO-0001', 'MSG-DEMO-0001',
 'inbound', 'received', '{"source":"seed","type":"message"}'::jsonb)
ON CONFLICT (tenant_id, event_id) DO NOTHING;

INSERT INTO auth_sessions (
    session_id, tenant_id, user_id, user_email, role, refresh_token_hash, expires_at, revoked_at, replaced_by_session_id, last_used_at
)
VALUES
('SESS-DEMO-0001', 'TEN-DEMO01', 'USER-DEMO-OWNER', 'owner.demo@lavitat.test', 'owner',
 'seed_refresh_hash_demo_0001', NOW() + INTERVAL '30 days', NULL, NULL, NOW())
ON CONFLICT (session_id) DO NOTHING;

INSERT INTO auth_token_revocations (
    tenant_id, token_hash, token_jti, user_id, reason, expires_at
)
VALUES
('TEN-DEMO01', 'seed_revoked_token_hash_demo_0001', 'seed-jti-0001', 'USER-DEMO-OWNER', 'seed_test', NOW() + INTERVAL '7 days')
ON CONFLICT (token_hash) DO NOTHING;

INSERT INTO tenant_integrations (tenant_id, config_json)
VALUES
('TEN-DEMO01', '{"openai":{"model":"gpt-4o-mini","enabled":true},"meta":{"graphVersion":"v22.0","enabled":true}}'::jsonb)
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO saas_access_catalog (scope, catalog_json)
VALUES
('SEED-DEMO-SCOPE', '{"owner":{"required":["users.read","modules.read"],"optional":["catalog.write","clients.write"]}}'::jsonb)
ON CONFLICT (scope) DO NOTHING;

INSERT INTO saas_plan_limits (scope, limits_json)
VALUES
('SEED-DEMO-SCOPE', '{"starter":{"users":5,"modules":1,"catalogs":1},"pro":{"users":25,"modules":5,"catalogs":10}}'::jsonb)
ON CONFLICT (scope) DO NOTHING;

INSERT INTO tenant_ai_usage (tenant_id, month_key, requests)
VALUES
('TEN-DEMO01', to_char(current_date, 'YYYY-MM'), 42)
ON CONFLICT (tenant_id, month_key) DO NOTHING;

INSERT INTO tenant_ai_chat_history (
    tenant_id, entry_id, scope_chat_id, base_chat_id, scope_module_id,
    mode, role, content, assistant_id, user_id, user_name, metadata, created_at_unix
)
VALUES
('TEN-DEMO01', 'AIH-DEMO-0001', 'CHAT-DEMO-0001::MOD-DEMO-WA1', 'CHAT-DEMO-0001', 'MOD-DEMO-WA1',
 'copilot', 'assistant', 'Sugerencia demo para cierre comercial.',
 'AIA-DEMO-01', 'USER-DEMO-OWNER', 'Owner Demo', '{"source":"seed"}'::jsonb,
 (extract(epoch from now()) * 1000)::bigint)
ON CONFLICT (tenant_id, entry_id) DO NOTHING;

INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, payload)
SELECT
    'TEN-DEMO01', 'USER-DEMO-OWNER', 'seed_demo_loaded', 'system', 'seed-v1',
    '{"note":"Seed ficticio cargado"}'::jsonb
WHERE NOT EXISTS (
    SELECT 1
    FROM audit_logs
    WHERE tenant_id = 'TEN-DEMO01'
      AND action = 'seed_demo_loaded'
      AND resource_id = 'seed-v1'
);

COMMIT;
