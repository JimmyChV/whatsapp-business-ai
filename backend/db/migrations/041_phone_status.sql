ALTER TABLE tenant_customers
  ADD COLUMN IF NOT EXISTS phone_status TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS phone_status_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS phone_status_error_code INTEGER;

-- Valores posibles de phone_status:
-- 'unknown'   -> nunca validado
-- 'valid'     -> tiene WhatsApp activo
-- 'invalid'   -> no tiene WhatsApp o numero inexistente
-- 'blocked'   -> bloqueo tu cuenta
-- 'failed'    -> error al enviar u otro fallo
