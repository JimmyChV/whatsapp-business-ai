# Chat Business (Commercial Layer)

Purpose:
- Implement commercial context over chat runtime:
  - catalog visibility/selection,
  - profile overlays,
  - cart mutations,
  - AI commercial context.

Contains:
- `components/*`: business-facing composite components (`BusinessSidebar`, `ClientProfilePanel`).
- `sections/*`: business UI sections (`BusinessCatalogTab`, `BusinessAiTabSection`, `BusinessCartTabSection`, `BusinessQuickRepliesTabSection`, `BusinessProfiles`).
- `sections/catalog/*`: catalog-specific presentational subcomponents (`BusinessCatalogProductCard`, `BusinessCatalogProductForm`).
- `hooks/*`: business state synchronization hooks.
- `helpers/*`: commercial pure helpers (catalog, cart, business normalization).
  - includes AI message rendering helper (`aiMessageRender.helpers.jsx`) to keep JSX parsing logic out of `BusinessSidebar`.
- `services/*`: business socket/request bridges.

Rules:
1. `business/*` may consume `chat/core/*`.
2. `chat/core/*` must not import `business/*`.
3. Business logic should stay out of generic runtime components unless passed as props/callbacks.
