# Backend Architecture Baseline (Phase 2)

Target per domain:
- routes/
- controllers/
- services/
- repositories/
- validators/

Current state:
- routes already moved to domain registrars.
- this phase starts service migration with compat wrappers.

Rule:
- migrate consumers to domain services first.
- move implementation files after import graph is stable.
