# Backend Architecture Baseline (Phase 2)

Canonical tenant domain layout:
- `routes/`: HTTP route registrars.
- `services/`: tenant business logic (control plane, modules, catalogs, customers, quick replies).
- `helpers/`: pure payload/asset helpers shared by tenant routes.

Current state:
- routes and services are migrated.
- reusable sanitizers live in `helpers/admin-payload-sanitizers.js`.
- upload parsing/storage helpers live in `helpers/asset-upload.helpers.js`.

Rule:
- keep `server.js` as bootstrap/orchestration only.
- any new tenant payload validation must be implemented under `helpers/`, not in root bootstrap.
