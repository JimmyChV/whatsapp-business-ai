# Phase 3 Foundation

Base branch for Phase 3 execution after PR 115 merge.

## Scope in this branch
- Keep `main` as source of truth before every block of work.
- Continue incremental frontend/backend architecture cleanup.
- Preserve runtime stability while extracting domains/capas.

## Initial checkpoints
1. Frontend: reduce orchestration in `App.jsx` and keep feature boundaries.
2. SaaS panel: continue section/hook decomposition with stable effects.
3. Backend: move remaining server-level logic into domain services incrementally.
4. Add regression checks before each push (build + key startup path).
