# Chat Feature Architecture

Canonical layout:
- `components/`: core chat UI (sidebar, window, input, modals).
- `business/sections/`: right-panel business views (catalogo, perfiles).
- `business/hooks/`: business context state/effects.
- `business/helpers/`: business pure helpers.
- `hooks/`: chat runtime hooks (socket, pagination, actions, sync).
- `helpers/`: generic chat utilities.
- `services/`: chat transport/service adapters.

Rules:
1. Channel runtime logic stays in `hooks/` and `services/`.
2. Catalog/profile-specific logic stays in `business/*`.
3. Keep render components slim; move transformations to helpers/hooks.
