# Operations Domain

Purpose:
- Conversation operations and telemetry/KPI logic.
- AI prompt context and chat history policies.

Structure:
- `routes/*`: operational HTTP APIs.
- `services/*`: orchestration services (assignment, KPI, AI context/history).
- `helpers/*`: pure helpers/schemas for operations parsing/validation.
  - `request-ops.helpers.js`: request-id and ops-token authorization helpers used by HTTP bootstrap.
- `index.js`: domain barrel export.

Rules:
1. Services remain stateless where possible; persistence is delegated to storage drivers.
2. Route handlers should be thin and call services only.
3. KPI/assignment computation must be deterministic and tenant-scoped.
