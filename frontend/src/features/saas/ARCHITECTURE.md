# SaaS Feature Architecture

Canonical layout:
- `components/`: container-level UI (`SaasAdminPanel`, shell, panel primitives).
- `components/panel/`: reusable panel widgets (header/nav/tenant picker/image drop input).
- `sections/`: business sections (Empresas, Usuarios, Modulos, Catalogos, etc.).
- `hooks/`: orchestration/state/actions/effects for SaaS panel.
- `services/`: SaaS API access layer (including operations/admin assignment APIs).
- `helpers/`: pure utilities/constants (no side effects).

Rules:
1. Section business logic lives in `hooks/` + `services/`, not in JSX view files.
2. `sections/*` should stay mostly declarative/presentational.
3. Cross-feature imports must go through feature APIs, not deep relative chains when avoidable.
