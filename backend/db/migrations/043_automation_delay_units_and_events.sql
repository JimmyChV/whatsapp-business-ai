-- Amplia automatizaciones comerciales con más eventos y unidades de tiempo.

ALTER TABLE tenant_automation_rules
  ADD COLUMN IF NOT EXISTS delay_value INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delay_unit TEXT DEFAULT 'minutes',
  ADD COLUMN IF NOT EXISTS delay_seconds INTEGER DEFAULT 0;

ALTER TABLE tenant_automation_rules
  DROP CONSTRAINT IF EXISTS tenant_automation_rules_event_key_check;

ALTER TABLE tenant_automation_rules
  ADD CONSTRAINT tenant_automation_rules_event_key_check
  CHECK (event_key IN (
    'quote_accepted',
    'order_programmed',
    'order_attended',
    'order_expired',
    'order_lost',
    'order_sold'
  ));

UPDATE tenant_automation_rules
   SET delay_value = COALESCE(NULLIF(delay_value, 0), COALESCE(delay_minutes, 0)),
       delay_unit = COALESCE(NULLIF(delay_unit, ''), 'minutes'),
       delay_seconds = CASE
         WHEN COALESCE(delay_seconds, 0) > 0 THEN delay_seconds
         ELSE COALESCE(delay_minutes, 0) * 60
       END
 WHERE COALESCE(delay_minutes, 0) > 0
    OR COALESCE(delay_seconds, 0) > 0;
