# Cloud Migration Ready Plan

This project currently runs on `whatsapp-web.js` (QR session) and now includes a transport selector via `WA_TRANSPORT`.

## Current runtime behavior
- `WA_TRANSPORT=webjs`: uses the current provider.
- `WA_TRANSPORT=cloud`: currently logs fallback and still runs on `webjs` (safe mode).

## Goal
Keep all current UX/features and switch backend transport to Cloud API when ready, without rewriting frontend.

## Backend contract to preserve
Socket events and payloads should stay stable:
- inbound/outbound: `message`
- acks: `message_ack`
- edit sync: `message_edited`, `message_editability`
- chat loading: `chats`, `chat_history`, `chat_updated`
- business data: `business_data`, `business_data_catalog`
- quick replies: `quick_replies`

## Migration phases
1. Add Cloud webhook receiver and signature validation.
2. Implement Cloud provider adapter for send/receive/read.
3. Map Cloud webhooks to existing socket payload contract.
4. Keep catalog source as Meta/Woo and enrich order line items by `product_retailer_id`.
5. Enable `WA_TRANSPORT=cloud` in staging and compare parity.
6. Cut over production transport.

## Environment keys for Cloud phase
- `META_APP_ID`
- `META_APP_SECRET`
- `META_SYSTEM_USER_TOKEN`
- `META_WABA_ID`
- `META_WABA_PHONE_NUMBER_ID`
- `META_VERIFY_TOKEN`

## Non-goals for current stage
- No Cloud calls are executed yet.
- No frontend behavior changes are required now.
