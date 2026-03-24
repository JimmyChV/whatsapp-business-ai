# Backend Architecture Baseline (Phase 2)

Canonical tenant domain layout:
- `routes/`: HTTP route registrars.
- `services/`: tenant business logic (control plane, modules, catalogs, customers, quick replies).
- `helpers/`: pure payload/asset helpers shared by tenant routes.

Current state:
- routes and services are migrated.
- reusable sanitizers live in `helpers/admin-payload-sanitizers.js`.
- upload parsing/storage helpers live in `helpers/asset-upload.helpers.js`.
- control-plane normalizers/ID generators are isolated in `helpers/tenant-control-normalizers.helpers.js`.
- customer normalization/CSV parsing helpers are isolated in `helpers/customers-normalizers.helpers.js`.
- integrations normalizers/defaults/secret handlers are isolated in `helpers/integrations-normalizers.helpers.js`.

Rule:
- keep `server.js` as bootstrap/orchestration only.
- any new tenant payload validation must be implemented under `helpers/`, not in root bootstrap.
