ALTER TABLE tenant_zone_rules
  ADD COLUMN IF NOT EXISTS payment_modality JSONB
    NOT NULL DEFAULT '{"advance": true, "cash_on_delivery": false}'::jsonb;

UPDATE tenant_zone_rules
   SET payment_methods = payment_methods || '{"cash": false}'::jsonb
 WHERE tenant_id IS NOT NULL
   AND NOT (payment_methods ? 'cash');
