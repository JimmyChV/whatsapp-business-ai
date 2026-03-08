# Cloud Migration Ready Plan

This project now runs in dual transport mode through `backend/wa_provider.js`.

## Current runtime behavior
- `WA_TRANSPORT=dual` (recommended): frontend asks user to choose `webjs` or `cloud` per session.
- `WA_TRANSPORT=webjs`: starts QR/Web.js flow.
- `WA_TRANSPORT=cloud`: starts Cloud API flow (requires `META_*` variables).
- Runtime and capabilities are exposed at `GET /api/wa/runtime`.

## Security and webhook status
- Cloud webhook verify endpoint: `GET /webhook/whatsapp`.
- Cloud webhook ingest endpoint: `POST /webhook/whatsapp`.
- Signature validation (`X-Hub-Signature-256`) is enforced when:
  - `META_APP_SECRET` is configured, and
  - `META_ENFORCE_SIGNATURE=true` (default).

## Contract parity preserved for frontend
Socket events remain stable across transports:
- inbound/outbound: `message`
- acks: `message_ack`
- chat loading: `chats`, `chat_history`, `chat_updated`
- business/profile data: `business_data`, `my_profile`, `contact_info`
- capabilities/runtime: `wa_capabilities`, `wa_runtime`

## Known capability differences
- `webjs`: edit/forward/delete/reply available (subject to WhatsApp rules and version).
- `cloud`: reply available; edit/forward/delete currently disabled.
- Quick replies native CRUD are not exposed in current WA Web.js API version.

## Migration checklist to production Cloud-first
1. Keep webhook publicly reachable with TLS.
2. Configure and verify all `META_*` variables.
3. Validate parity for high-volume flows (orders, product shares, quoted replies).
4. Enable Cloud for pilot users, monitor `message_ack` and `chat_updated` latency.
5. Switch default `WA_TRANSPORT` from `dual` to `cloud` when KPI parity is acceptable.
