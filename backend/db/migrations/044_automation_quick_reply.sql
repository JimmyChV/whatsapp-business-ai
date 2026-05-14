ALTER TABLE tenant_automation_rules
  ADD COLUMN IF NOT EXISTS quick_reply_code TEXT DEFAULT NULL;
