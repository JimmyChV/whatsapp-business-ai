# Chat Business (Commercial Layer)

Purpose:
- Implement commercial context over chat runtime:
  - catalog visibility/selection,
  - profile overlays,
  - cart mutations,
  - AI commercial context.

Contains:
- `components/*`: business-facing composite components (`BusinessSidebar`, `ClientProfilePanel`).
- `sections/*`: business UI sections (`BusinessCatalogTab`, `BusinessProfiles`).
- `hooks/*`: business state synchronization hooks.
- `helpers/*`: commercial pure helpers (catalog, cart, business normalization).
- `services/*`: business socket/request bridges.

Rules:
1. `business/*` may consume `chat/core/*`.
2. `chat/core/*` must not import `business/*`.
3. Business logic should stay out of generic runtime components unless passed as props/callbacks.
