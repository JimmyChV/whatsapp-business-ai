# Global Backend Architecture Baseline (Phase 2)

Canonical structure:
- `server.js`: bootstrap and route registration only.
- `domains/<domain>/routes/*`: HTTP route registrars.
- `domains/<domain>/services/*`: domain logic and orchestration.
- `domains/<domain>/helpers/*`: pure utilities for the domain (if needed).
- `db/*`: migrations and DB tooling.
- `data/legacy/*`: compatibility seed/fallback files migrated from backend root.
- `data/cache/*`: runtime cache artifacts (no cache under source folders).
- `scripts/*`: operational scripts.
- `test/*`: automated tests.

Current migration policy:
1. New implementations must be created under `domains/*/services`.
2. Domain root should expose only `index.js`, `ARCHITECTURE.md`, and optional compatibility shims.
3. Root `backend/*.js` must remain minimal and infrastructural only.
4. Empty placeholder folders are removed until they have real implementation.

Latest canonicalized modules:
- operations: `ai.service`, `ai-prompt-context.service`, `ops-telemetry.service`.
- channels: `routes/http-routes-cloud-webhook.js`, `socket-manager.service`, `media-manager.service`.
- tenant: `tenant-control.service`, `woocommerce.service`.
- tenant helpers: `helpers/admin-payload-sanitizers.js` for admin/CRM payload validation reused by route registration.
- security: `email.service`, `meta-config-crypto.service`, `helpers/security-utils`.

Current root JS surface:
- `server.js` (bootstrap)
- `config/persistence-runtime.js` (storage runtime abstraction)
- `config/rate-limiter.js` (shared limiter utility)
- `config/logger.js` (shared logger utility)
- `config/runtime-flags.js` (env/runtime flag normalization + CORS checker factory)
