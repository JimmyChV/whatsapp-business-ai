# Chat Core (Runtime Layer)

Purpose:
- Handle real-time chat runtime and channel orchestration.
- Keep transport/socket/state-sync logic outside business/commercial rules.

Contains:
- `hooks/*`: runtime hooks (socket lifecycle, pagination, message actions, sync effects).
- `helpers/*`: pure runtime helpers (chat ids, filters, normalization, WA launch params).
- `services/*`: runtime adapters (`socketClient`).

Does not contain:
- Catalog strategy, cart behavior, copilot business prompts, commercial UI policy.

Contract:
- `core/*` can be reused by any channel/workspace surface.
- `business/*` depends on `core/*`, never the opposite direction.
