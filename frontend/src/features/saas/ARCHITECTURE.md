# SaaS Feature Architecture

Canonical layout:
- `components/`: container-level UI (`SaasAdminPanel`, shell, panel primitives).
- `components/panel/`: reusable panel widgets (header/nav/tenant picker/image drop input) + section composition layer.
  - `SaasPanelEntitySections`: resumen/empresas/usuarios/clientes.
  - `SaasPanelOpsAndAutomationSections`: operacion/ia/etiquetas/respuestas rapidas.
  - `SaasPanelConfigAndGovernanceSections`: modulos/catalogos/roles/planes.
  - `index.js`: single feature-level panel export surface.
- `sections/`: business sections (Empresas, Usuarios, Modulos, Catalogos, etc.).
- `hooks/`: feature hooks grouped by responsibility.
  - `hooks/panel/*`: panel lifecycle, selection, sync effects and cross-navigation orchestration.
  - `hooks/*.js`: domain actions (plans/roles, tenants/users, catalogs, IA, quick replies, labels, customers, operation access).
- `services/`: SaaS API access layer (including operations/admin assignment APIs).
- `helpers/`: pure utilities/constants (no side effects).

Rules:
1. Section business logic lives in `hooks/` + `services/`, not in JSX view files.
2. `sections/*` should stay mostly declarative/presentational.
3. Cross-feature imports must go through feature APIs, not deep relative chains when avoidable.
