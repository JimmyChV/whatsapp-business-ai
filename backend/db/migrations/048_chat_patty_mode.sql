ALTER TABLE tenant_chat_commercial_status
  ADD COLUMN IF NOT EXISTS patty_mode TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS patty_mode_until TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS patty_taken_by TEXT DEFAULT NULL;

ALTER TABLE tenant_chat_commercial_status
  DROP CONSTRAINT IF EXISTS tenant_chat_commercial_status_patty_mode_check;

ALTER TABLE tenant_chat_commercial_status
  ADD CONSTRAINT tenant_chat_commercial_status_patty_mode_check
  CHECK (patty_mode IS NULL OR patty_mode IN ('autonomous', 'review', 'off'));
