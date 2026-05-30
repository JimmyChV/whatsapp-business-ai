CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           SERIAL PRIMARY KEY,
  user_id      TEXT NOT NULL,
  tenant_id    TEXT NOT NULL,
  device_id    TEXT,
  endpoint     TEXT NOT NULL,
  p256dh       TEXT NOT NULL,
  auth_key     TEXT NOT NULL,
  device_type  TEXT,
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_tenant
  ON push_subscriptions(user_id, tenant_id, is_active);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_tenant
  ON push_subscriptions(tenant_id, is_active);
