# SaaS Feature Architecture

## Current baseline (phase 2)
- `components/`: top-level UI container (`SaasAdminPanel`) and panel composition.
- `components/panel/`: panel primitives + section composition wrappers.
- `sections/`: business-facing views by tab.
- `hooks/panel/*`: lifecycle/sync/selection/bootstrap helpers.
- `hooks/*.js`: domain actions and API orchestration.
- `services/`: HTTP contracts per SaaS domain.
- `helpers/`: pure constants/mappers/formatters.

## Structural risks detected
1. `SaasAdminPanel` still concentrates orchestration for all domains.
2. Section context assembly uses broad object merges, with collision risk between state/action names.
3. Section wrappers still receive very large context contracts (high prop-surface area).
4. Domain hooks are colocated but not yet grouped by bounded context (`tenants`, `users`, `catalogs`, `quickReplies`, etc.).

## Target minimum architecture (solid + incremental)

### 1) Controller layer for panel
- Introduce `hooks/panel/controller/` as orchestration entrypoint.
- `useSaasPanelController` must return only:
  - `frame`: header/navigation/tenant-picker props.
  - `permissions`: normalized capability map.
  - `sections`: `entity`, `ops`, `governance` scoped contexts.
  - `lifecycle`: close/open-operation/high-level handlers.

### 2) Domain grouping (no rewrite, only relocation)
- Organize hooks/services by domain:
  - `hooks/domains/tenants/*`
  - `hooks/domains/users/*`
  - `hooks/domains/modules/*`
  - `hooks/domains/catalogs/*`
  - `hooks/domains/quickReplies/*`
  - `hooks/domains/labels/*`
  - `hooks/domains/ai/*`
  - `hooks/domains/operations/*`
- Keep current exports through `hooks/index.js` for compatibility during migration.

### 3) Section context contracts (explicit, no blind spread)
- Replace broad merge assembly with explicit context builders:
  - `buildEntitySectionContext(controllerState)`
  - `buildOpsSectionContext(controllerState)`
  - `buildGovernanceSectionContext(controllerState)`
- Each builder must whitelist keys to avoid accidental overrides.

### 4) View-layer goal
- `SaasAdminPanel.jsx` must be mostly declarative:
  - call `useSaasPanelController`
  - render `SaasPanelFrame`
  - render section wrappers using controller-provided contexts

## Migration rules (mandatory)
1. No massive rewrite in one PR.
2. Every move keeps backwards-compatible exports until consumer migration is complete.
3. Every new context builder is explicit-key only.
4. Every incremental cut must pass:
   - `frontend npm run build`
   - existing backend tests

## Next incremental cuts
1. Stabilize initialization order and remove use-before-declare hazards in panel orchestration.
2. Introduce controller hook skeleton and move frame/lifecycle wiring there.
3. Replace spread-based section context merge with explicit builders.
4. Move domain hooks/services to `domains/*` folders with compatibility exports.
