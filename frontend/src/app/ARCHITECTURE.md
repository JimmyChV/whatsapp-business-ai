# Frontend Architecture Baseline (Phase 2)

Canonical structure:
- `app/`: app-level wiring and architecture notes.
- `app/helpers/`: glue utilities for app composition (`operationPageProps`).
- `app/hooks/`: top-level state orchestration hooks (`useAppSessionTransportState`, `useAppRuntimeGate`).
- `app/components/`: app-level shell/gate UI (`AppRuntimeGate`).
- `pages/`: route-level screens (`OperationPage`, `SaasPanelPage`).
- `routes/`: route map and navigation config.
- `features/<domain>/`: business code by domain (`chat`, `saas`, `auth`).
- `shared/components/`: truly cross-feature UI primitives.

Rules now in force:
1. Chat feature is split into `features/chat/core/*` (runtime) and `features/chat/business/*` (comercial/context).
2. SaaS panel UI and logic live in `features/saas/*`.
3. Operation APIs used by SaaS panel live in `features/saas/services/operations.service.js`.
4. Avoid adding new files to `src/components`; use `features/*` or `shared/components`.
5. If compatibility wrappers are needed, they must be temporary and tracked in the migration plan.
6. `App.jsx` should orchestrate flow only; workspace state lives in `features/chat/core/hooks/useOperationWorkspaceState.js`.
7. Runtime gate decisions (login, panel, transport bootstrap, main) should be resolved via `app/helpers/runtimeGate.helpers.js`.

Feature docs:
- `features/chat/ARCHITECTURE.md`
- `features/saas/ARCHITECTURE.md`
