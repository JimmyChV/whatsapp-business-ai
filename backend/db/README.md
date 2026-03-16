# Postgres migrations (SaaS)

## 1) Variables requeridas

En `backend/.env` define al menos:

- `SAAS_STORAGE_DRIVER=postgres`
- `DATABASE_URL=postgresql://user:pass@host:5432/dbname`

Alternativa por variables separadas:

- `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`
- opcional: `PGSSL=true`

## 2) Aplicar migraciones en orden

Desde `backend/`:

```powershell
psql "$env:DATABASE_URL" -f db/migrations/001_saas_foundation.sql
psql "$env:DATABASE_URL" -f db/migrations/002_tenant_settings.sql
psql "$env:DATABASE_URL" -f db/migrations/003_message_history.sql
psql "$env:DATABASE_URL" -f db/migrations/004_auth_sessions.sql
psql "$env:DATABASE_URL" -f db/migrations/005_wa_modules.sql
psql "$env:DATABASE_URL" -f db/migrations/006_message_history_module_context.sql
psql "$env:DATABASE_URL" -f db/migrations/007_admin_profiles_and_module_media.sql
psql "$env:DATABASE_URL" -f db/migrations/008_customers.sql
psql "$env:DATABASE_URL" -f db/migrations/009_multichannel_unified_inbox.sql
psql "$env:DATABASE_URL" -f db/migrations/010_catalog_items_module_pk.sql
psql "$env:DATABASE_URL" -f db/migrations/011_ai_chat_history.sql
psql "$env:DATABASE_URL" -f db/migrations/012_control_plane_hardening.sql
psql "$env:DATABASE_URL" -f db/migrations/013_customer_channels.sql
```

## 3) Tablas esperadas

Core SaaS:

- `tenants`
- `users`
- `memberships`
- `tenant_settings`
- `wa_modules`
- `quick_replies`
- `catalog_items`
- `tenant_catalogs`
- `tenant_integrations`

Operacion/Historial:

- `tenant_chats`
- `tenant_messages`
- `tenant_ai_chat_history`
- `tenant_customers`
- `tenant_customer_identities`
- `tenant_channel_events`
- `audit_logs`

Auth / seguridad:

- `auth_sessions`
- `auth_token_revocations`

Control-plane global:

- `saas_access_catalog`
- `saas_plan_limits`
- `tenant_ai_usage`

## 4) Validacion rapida

```sql
\dt

SELECT tenant_id, slug, plan, is_active FROM tenants ORDER BY tenant_id;
SELECT user_id, email, is_active FROM users ORDER BY created_at DESC;
SELECT tenant_id, user_id, role, is_active FROM memberships ORDER BY tenant_id, user_id;
```

## 5) Notas

- `012_control_plane_hardening.sql` alinea el esquema real usado por el backend (catalogos multi-tenant, integraciones, RBAC catalog, limites y uso IA).
- `catalog_items` queda con PK compuesta: `(tenant_id, item_id, module_id, catalog_id)`.
- `013_customer_channels.sql` garantiza las tablas de identidades y eventos por canal usadas por operacion y trazabilidad multi-canal.
- Si una instancia antigua falla por tabla faltante, reaplica migraciones hasta `013`.

