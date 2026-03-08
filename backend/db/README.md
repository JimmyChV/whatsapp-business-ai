# Postgres migration guide (SaaS phase 2)

## 1) Configure backend env

Set these variables in `backend/.env`:

- `SAAS_STORAGE_DRIVER=postgres`
- `DATABASE_URL=postgresql://user:pass@host:5432/dbname`

Alternative split vars:

- `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`
- Optional `PGSSL=true`

## 2) Apply migration

Run from backend folder:

```powershell
psql "$env:DATABASE_URL" -f db/migrations/001_saas_foundation.sql
```

Or with split vars already exported:

```powershell
psql -f db/migrations/001_saas_foundation.sql
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
- `audit_logs`

## Notes

- Current runtime keeps `file` as default driver for backward compatibility.
- `postgres` driver is already wired for `catalog_manager` and `quick_replies_manager`.
- If `pg` dependency is missing, backend will show a clear error when `SAAS_STORAGE_DRIVER=postgres`.
