ALTER TABLE tenant_chat_commercial_status
  ADD COLUMN IF NOT EXISTS needs_advisor BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_advisor_reason TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS needs_advisor_at TIMESTAMPTZ DEFAULT NULL;
