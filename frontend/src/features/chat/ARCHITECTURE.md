# Chat Feature Architecture

Canonical layout:
- `components/`: core chat UI public exports (sidebar, window, input, modals).
- `core/hooks/`: runtime hooks (socket, pagination, actions, sync).
- `core/helpers/`: generic chat utilities.
- `core/services/`: chat transport/service adapters.
- `business/components/`: business composite UI (`BusinessSidebar`, profile panel).
- `business/sections/`: right-panel business views (catalogo, perfiles).
- `business/hooks/`: business context state/effects.
- `business/helpers/`: business pure helpers.

Rules:
1. Channel/runtime logic lives in `core/*`.
2. Catalog/profile/copilot-specific logic lives in `business/*`.
3. Keep render components slim; move transformations to helpers/hooks.
4. Workspace app state for operation chat is centralized in `core/hooks/useOperationWorkspaceState.js`.

Sub-documents:
- `core/ARCHITECTURE.md`
- `business/ARCHITECTURE.md`
