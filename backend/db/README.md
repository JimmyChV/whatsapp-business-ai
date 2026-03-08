# Postgres migration guide (SaaS phase 2)

## 1) Configure backend env

Set these variables in `backend/.env`:

- `SAAS_STORAGE_DRIVER=postgres`
- `DATABASE_URL=postgresql://user:pass@host:5432/dbname`

Alternative split vars:

- `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`
- Optional `PGSSL=true`

## 2) Apply migrations

Run from backend folder in order:

```powershell
psql "$env:DATABASE_URL" -f db/migrations/001_saas_foundation.sql
psql "$env:DATABASE_URL" -f db/migrations/002_tenant_settings.sql
psql "$env:DATABASE_URL" -f db/migrations/003_message_history.sql
psql "$env:DATABASE_URL" -f db/migrations/004_auth_sessions.sql
```

Or with split vars already exported:

```powershell
psql -f db/migrations/001_saas_foundation.sql
psql -f db/migrations/002_tenant_settings.sql
psql -f db/migrations/003_message_history.sql
psql -f db/migrations/004_auth_sessions.sql
```

## 3) Verify

Check tables:

```sql
\dt
```

Expected core tables:

- `tenants`
- `users`
- `memberships`
- `wa_sessions`
- `quick_replies`
- `catalog_items`
- `tenant_settings`
- `tenant_chats`
- `tenant_messages`
- `audit_logs`
- `auth_sessions`
- `auth_token_revocations`

## 4) Tenant settings API

- `GET /api/tenant/settings`
- `PUT /api/tenant/settings`

Current key settings:

- `catalogMode`: `hybrid` | `woo_only` | `local_only`
- `enabledModules`: `aiPro`, `catalog`, `cart`, `quickReplies`, `locations`
- `wa.transportLock`: `auto` | `webjs` | `cloud`

## Notes

- Current runtime keeps `file` as default driver for backward compatibility.
- `postgres` driver is wired for `catalog_manager`, `quick_replies_manager` and `tenant_settings_service`.
- If `pg` dependency is missing, backend will show a clear error when `SAAS_STORAGE_DRIVER=postgres`.
