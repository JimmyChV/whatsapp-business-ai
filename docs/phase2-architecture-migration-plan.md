# Phase 2 - Architecture Migration Plan (Incremental, Safe)

## Scope
This plan keeps Phase 2 focused on maintainability and runtime safety.
No mass rewrite: every movement keeps current behavior via compatibility wrappers.

## Current hotspots (remaining)

### Frontend
- `frontend/src/App.jsx` still orchestrates too much chat/runtime state.
- `frontend/src/features/saas/components/SaasAdminPanel.jsx` still centralizes many section concerns.
- `frontend/src/features/chat/components/BusinessSidebar.jsx` still combines UI and cross-feature orchestration.

### Backend
- Root still contains large legacy implementations (`server.js`, `socket_manager.js`, channel/integration services, control-plane services).
- Domain-first shape exists, but not all implementations have been inverted yet.

## Target shape (minimal)

### Frontend
- `app/`, `pages/`, `routes/`
- `features/<domain>/{components,sections,hooks,services,helpers}`
- `components/*` only as compatibility facades during migration.

### Backend
- `domains/<domain>/{routes,services,repositories,validators}`
- Root files only for: entrypoints + compatibility wrappers.
- `config/`, `db/`, `scripts/`, `test/`.

## Migration stages

### Stage A (done)
- Frontend architecture scaffold + pages/routes foundation.
- Tenant/security/operations domain wrappers created.

### Stage B (in progress)
- `SaasAdminPanel` split into hooks and section sync layers.
- `App.jsx` chat logic split into dedicated hooks (navigation, transport, send, attachments).

### Stage C (in progress)
- Domain inversion for backend services (implementation in `domains/*`, root as compat).
- Completed inversions:
  - operations: assignment rules/router, conversation ops, message history, KPI, AI chat history.
  - tenant: tenant core, catalog manager, quick replies manager.
  - security: auth, auth recovery, auth sessions, audit logs, password hash.

### Stage D (done in this step)
- Frontend business internals moved from `components/business/*` to `features/chat/business/*`.
- `components/business/*` now act as compatibility facades.
- Operation page now imports chat components directly from `features/chat/components`.
- `AppErrorBoundary` moved to `shared/components` as canonical shared layer.
- Removed `src/components/*` compatibility wrappers already replaced by direct `features/*` imports.
- Tenant domain routes moved to `backend/domains/tenant/routes/*` to avoid flat root clutter.
- Tenant integrations and quick reply library implementations moved into `backend/domains/tenant/services/*`.
- Removed empty placeholder directories (`controllers/repositories/validators/middlewares`) until real implementation is added.

### Stage E (next)
- Continue domain inversion for remaining backend root heavy services:
  - channels/integrations (`whatsapp_cloud_client`, `whatsapp_client`, `woocommerce_service`, `wa_provider`).
  - control-plane/security helpers where applicable.
- Start repository layer extraction for persistence-heavy services.

### Stage F (final Phase 2 closeout)
- Remove unused compatibility facades after imports are fully migrated.
- Freeze import boundaries with lint rules/path aliases.

## Risk controls
- Keep compatibility wrappers during transition.
- Validate each block with:
  - `cd backend; npm.cmd test`
  - `cd frontend; npm.cmd run build`
- Commit in small vertical slices and push every stable block.
