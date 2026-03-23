# Channels Domain

Purpose:
- Channel adapters and transport orchestration (Cloud/WebJS compatibility).
- Socket runtime and media handling.

Structure:
- `routes/*`: HTTP route registrars for channel endpoints/webhooks.
- `services/*`: runtime channel services (`wa-provider`, `socket-manager`, `media-manager`).
- `helpers/*`: pure utilities shared by channel services.
  - scope/identity: `chat-scope.helpers.js`, `agent-meta.helpers.js`, `chat-profile.helpers.js`
  - sender/group metadata cache: `sender-meta.helpers.js`
  - message parsing: `message-location.helpers.js`, `message-file.helpers.js`, `message-media-assets.helpers.js`
  - runtime helpers: `chat-runtime.helpers.js`
- `index.js`: domain barrel export (`services` + `routes`).

Rules:
1. Channel business decisions (tenant config, plan limits) must be delegated to other domains.
2. Persistent media defaults to `backend/uploads` (or `SAAS_UPLOADS_DIR` override).
3. Runtime cache artifacts are stored under `backend/data/cache/*`, not under source folders.
