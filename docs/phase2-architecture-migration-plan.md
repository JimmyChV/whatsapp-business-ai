# Phase 2 - Architecture Migration Plan (Incremental, Safe)

## Scope
This plan aligns with Phase 2 hardening and maintainability goals.
No mass rewrite; all steps preserve current runtime behavior.

## Current hotspots (mislocated / oversized)

### Frontend
- `frontend/src/App.jsx` (2331 lines): too much orchestration.
- `frontend/src/components/SaasAdminPanel.jsx` (1700+ lines): cross-domain state + section orchestration.
- `frontend/src/components/ChatWindow.jsx` and `MessageBubble.jsx`: large UI/logic blend.
- `frontend/src/components/business/sections/BusinessCatalogTab.jsx`: reduced partially, still large.

### Backend
- Many service files still in backend root (`*_service.js`).
- `backend/server.js` improved but still bootstrap-heavy.
- Domain routes are extracted; service layer migration is ongoing.

## Target shape (minimal)

### Frontend
- `app/`, `pages/`, `routes/`, `features/*`, `shared/*`.

### Backend
- `domains/*` with `routes/controllers/services/repositories/validators`.
- `config/`, `middlewares/`, `db/`.

## Migration stages

### Stage A (done in this step)
- Scaffold frontend architecture folders.
- Add SaaS feature compat entrypoint.
- Add backend tenant domain service wrappers.
- Switch domain index to wrappers (no behavior change).

### Stage B
- Split `SaasAdminPanel` into:
  - layout renderer
  - section controller hooks
  - reduced state surface in component file.

### Stage C
- Split `App.jsx` into pages:
  - `OperationPage`
  - `SaasPanelPage`
  - route-based shell.

### Stage D (in progress)
- Move backend root services to domain service implementations.
- Introduce repositories for persistence access.
- Added service wrapper layers in domains/operations/services and domains/security/services and updated domain indexes.
- Moved security service implementations for access policy store and plan limits store/logic into domains/security/services and left root files as compatibility wrappers.
- Moved operations service implementations (assignment rules, assignment router, conversation ops, message history, KPI service) into `domains/operations/services` with root compatibility wrappers.
- Moved quick replies manager implementation into `domains/tenant/services` (`quick-replies-manager.service`) and kept root compatibility wrapper.
- Moved catalog manager implementation into `domains/tenant/services` (`catalog-manager.service`) and kept root compatibility wrapper.
- Moved AI chat history implementation into `domains/operations/services` (`ai-chat-history.service`) and kept root compatibility wrapper.

### Stage E
- Remove compatibility re-exports and legacy import paths.

## Risk controls
- Keep compatibility files during migration.
- Validate each block with:
  - `cd backend; npm.cmd test`
  - `cd frontend; npm.cmd run build`
- Commit in small blocks.