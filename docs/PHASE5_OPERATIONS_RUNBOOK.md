# Phase 5 Operations Runbook

This runbook closes the operational baseline for SaaS Phase 5.
It covers observability, backups/recovery, smoke-load validation, pilot KPI monitoring, and rollback.

## 1) Observability endpoints

Backend now exposes:

- `GET /api/ops/health`
- `GET /api/ops/ready`
- `GET /api/ops/metrics`

If `OPS_API_TOKEN` is set, send it as one of:

- `x-ops-token: <token>`
- `Authorization: Bearer <token>`

Example:

```powershell
curl.exe -H "x-ops-token: $env:OPS_API_TOKEN" http://localhost:3001/api/ops/health
curl.exe -H "x-ops-token: $env:OPS_API_TOKEN" http://localhost:3001/api/ops/ready
curl.exe -H "x-ops-token: $env:OPS_API_TOKEN" http://localhost:3001/api/ops/metrics
```

`/api/ops/ready` behavior:

- `OPS_READY_REQUIRE_WA=true`: ready only when WhatsApp runtime is ready.
- `OPS_READY_REQUIRE_WA=false`: ready when process is up.

## 2) Backup

### File driver (`SAAS_STORAGE_DRIVER=file`)

```powershell
cd backend
npm run ops:backup
```

Custom output and tenant filter:

```powershell
node scripts/backup_tenant_data.js --out ./backups/predeploy.json --tenant tenant_acme,tenant_beta
```

### Postgres driver (`SAAS_STORAGE_DRIVER=postgres`)

```powershell
cd backend
npm run ops:backup
```

Optional: skip heavy message data

```powershell
node scripts/backup_tenant_data.js --include-messages false
```

## 3) Restore

### File driver restore

```powershell
cd backend
npm run ops:restore -- --in ./backups/predeploy.json --mode merge
```

Replace mode for selected tenant:

```powershell
node scripts/restore_tenant_data.js --in ./backups/predeploy.json --tenant tenant_acme --mode replace
```

### Postgres restore

```powershell
cd backend
npm run ops:restore -- --in ./backups/predeploy.json --mode merge
```

Notes:

- Restore requires backup driver to match current `SAAS_STORAGE_DRIVER`.
- `replace` clears tenant-scoped tables before reinsert.
- `merge` upserts primary business tables and keeps existing rows.

## 4) Smoke load test

```powershell
cd backend
npm run ops:load-smoke -- --base-url http://localhost:3001 --ops-token $env:OPS_API_TOKEN --requests 180 --concurrency 12
```

Useful options:

- `--max-error-rate 0.05`
- `--max-p95-ms 1500`
- `--paths /api/ops/health,/api/ops/ready,/api/saas/runtime`

The script exits with code `1` when gates fail.

## 5) Go-live checklist

- [ ] `backend/.env.production` derived from `.env.production.example`.
- [ ] `OPS_API_TOKEN`, `SAAS_AUTH_SECRET`, and `SOCKET_AUTH_TOKEN` are strong random secrets.
- [ ] `ALLOWED_ORIGINS` points only to production frontend domains.
- [ ] `SAAS_STORAGE_DRIVER` and DB credentials validated.
- [ ] `npm test` passes in backend.
- [ ] `npm run build` passes in frontend.
- [ ] `npm run ops:backup` executed and artifact stored externally.
- [ ] `npm run ops:load-smoke` passes latency/error gates.
- [ ] `npm run ops:kpi-pilot` passes pilot KPI gates during operational window.
- [ ] `/api/ops/ready` and `/api/ops/metrics` monitored.

## 6) Pilot KPI monitor and external alerts

Run during pilot window (example: 20 samples, every 30s, max p95 1200ms):

```powershell
cd backend
npm run ops:kpi-pilot -- --base-url http://localhost:3001 --ops-token $env:OPS_API_TOKEN --samples 20 --interval-ms 30000 --max-p95-ms 1200 --max-error-rate 0.01 --min-ready-ratio 0.995 --out ./backups/pilot-report.json
```

If KPI gates fail, script exits with code `1`.

Optional external alert:

- Set `OPS_ALERT_WEBHOOK_URL` to your incident webhook endpoint.
- On failure, the script sends a compact JSON payload with failed checks and summary.

Default KPI envs:

- `OPS_PILOT_SAMPLES`
- `OPS_PILOT_INTERVAL_MS`
- `OPS_PILOT_TIMEOUT_MS`
- `OPS_PILOT_MAX_P95_MS`
- `OPS_PILOT_MAX_ERROR_RATE`
- `OPS_PILOT_MIN_READY_RATIO`

## 7) Rollback

1. Stop backend deployment.
2. Restore latest backup artifact (`ops:restore`).
3. Reapply previous release image/commit.
4. Validate `/api/ops/health`, `/api/ops/ready`, and tenant login flow.
5. Confirm chat open/send/edit critical path before reopening traffic.

## 8) Recommended next phase (Phase 6 prep)

- Managed metrics sink (Prometheus/Grafana or equivalent).
- Scheduled backups with retention policy.
- Canary rollout by tenant cohort.
- Cloud transport webhook replay protection at edge.
