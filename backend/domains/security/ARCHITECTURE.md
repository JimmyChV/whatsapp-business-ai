# Security Domain

Purpose:
- Authentication, access policy, plan limits, audit and credential/security utilities.

Structure:
- `routes/*`: auth/access HTTP route registrars.
- `services/*`: auth/session/access/plan/audit/email services.
- `helpers/*`: low-level security helpers.
- `index.js`: domain barrel export.

Rules:
1. Access policy and plan limits are treated as canonical authorization sources.
2. Audit logging is mandatory for admin-impacting mutations.
3. Security helpers must stay deterministic and side-effect free.
