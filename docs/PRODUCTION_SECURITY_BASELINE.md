# Production Security Baseline

This project can run in production with a safer default profile using the
variables below.

## 1) Required baseline

- `NODE_ENV=production`
- `ALLOWED_ORIGINS=https://app.tu-dominio.com`
- `SOCKET_AUTH_TOKEN=<long-random-secret>`
- `SOCKET_AUTH_REQUIRED=true`
- `META_ENFORCE_SIGNATURE=true`

## 2) Recommended hardening

- `SECURITY_HEADERS_ENABLED=true`
- `TRUST_PROXY=true` (only if behind reverse proxy / load balancer)
- `CORS_ALLOW_EMPTY_IN_PROD=false`
- `HTTP_RATE_LIMIT_ENABLED=true`
- `HTTP_RATE_LIMIT_WINDOW_MS=10000`
- `HTTP_RATE_LIMIT_MAX=120`
- `SOCKET_RATE_LIMIT_WINDOW_MS=10000`
- `SOCKET_RATE_LIMIT_MAX=30`
- `LINK_PREVIEW_TIMEOUT_MS=5000`
- `LINK_PREVIEW_MAX_BYTES=1048576`
- `LINK_PREVIEW_BLOCKED_HOSTS=localhost,metadata.google.internal,169.254.169.254`

## 3) Debug policy

Keep debug logs disabled in production unless troubleshooting:

- `ORDER_DEBUG=false`
- `ORDER_DEBUG_MISSING=false`
- `ORDER_DEBUG_VERBOSE=false`
- `CATALOG_DEBUG=false`

## 4) Operational checklist

1. Use HTTPS end-to-end.
2. Rotate `SOCKET_AUTH_TOKEN` and API keys periodically.
3. Never commit `.env` files with real secrets.
4. Keep webhook signature validation enabled (`META_ENFORCE_SIGNATURE=true`).
5. Restrict frontend origins to known domains only.
6. Monitor 429 rates to tune limits safely.

## 5) SaaS mode (multi-tenant)
- SAAS_ENABLED=true to enable tenant-aware runtime.
- SAAS_AUTH_ENABLED=true + SAAS_AUTH_SECRET for access tokens.
- SAAS_SOCKET_AUTH_REQUIRED=true to require SaaS token in socket handshake.
- Define SAAS_TENANTS_JSON and SAAS_USERS_JSON before onboarding real companies.
