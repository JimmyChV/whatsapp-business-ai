# Channels Domain

Purpose:
- Channel adapters and transport orchestration (Cloud/WebJS compatibility).
- Socket runtime and media handling.

Structure:
- `routes/*`: HTTP route registrars for channel endpoints/webhooks.
- `services/*`: runtime channel services (`wa-provider`, `socket-manager`, `media-manager`).
- `helpers/*`: pure utilities shared by channel services (scope/phone normalization, chat identity).
- `index.js`: domain barrel export (`services` + `routes`).

Rules:
1. Channel business decisions (tenant config, plan limits) must be delegated to other domains.
2. Persistent media defaults to `backend/uploads` (or `SAAS_UPLOADS_DIR` override).
3. Runtime cache artifacts are stored under `backend/data/cache/*`, not under source folders.
