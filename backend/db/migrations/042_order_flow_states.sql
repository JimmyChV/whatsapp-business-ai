-- Order flow v1: commercial states, automation rules and lifecycle labels.

ALTER TABLE tenant_chat_commercial_status
  DROP CONSTRAINT IF EXISTS tenant_chat_commercial_status_status_check;

ALTER TABLE tenant_chat_commercial_status
  ADD CONSTRAINT tenant_chat_commercial_status_status_check
  CHECK (
    status IN (
      'nuevo',
      'en_conversacion',
      'cotizado',
      'aceptado',
      'programado',
      'atendido',
      'expirado',
      'vendido',
      'perdido'
    )
  );

INSERT INTO global_labels (
  id,
  name,
  color,
  description,
  commercial_status_key,
  sort_order,
  is_active,
  created_at,
  updated_at
) VALUES
  (
    'ACEPTADO',
    'Aceptado',
    '#4CAF50',
    'Etiqueta comercial para pedidos aceptados por el cliente.',
    'aceptado',
    6,
    true,
    NOW(),
    NOW()
  ),
  (
    'PROGRAMADO',
    'Programado',
    '#1565C0',
    'Etiqueta comercial para pedidos programados.',
    'programado',
    7,
    true,
    NOW(),
    NOW()
  ),
  (
    'ATENDIDO',
    'Atendido',
    '#2E7D32',
    'Etiqueta comercial para pedidos atendidos.',
    'atendido',
    8,
    true,
    NOW(),
    NOW()
  ),
  (
    'EXPIRADO',
    'Expirado',
    '#616161',
    'Etiqueta comercial para cotizaciones expiradas.',
    'expirado',
    9,
    true,
    NOW(),
    NOW()
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  color = EXCLUDED.color,
  description = EXCLUDED.description,
  commercial_status_key = EXCLUDED.commercial_status_key,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

CREATE TABLE IF NOT EXISTS tenant_automation_rules (
  rule_id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  module_id TEXT,
  template_name TEXT,
  template_language TEXT DEFAULT 'es',
  delay_minutes INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT tenant_automation_rules_event_key_check
    CHECK (event_key IN ('quote_accepted', 'order_programmed', 'order_attended'))
);

CREATE INDEX IF NOT EXISTS idx_automation_rules_tenant
  ON tenant_automation_rules(tenant_id, event_key, is_active);

INSERT INTO global_labels (
  id,
  name,
  color,
  description,
  commercial_status_key,
  sort_order,
  is_active,
  created_at,
  updated_at
) VALUES
  (
    'PROSPECTO',
    'Prospecto',
    '#9E9E9E',
    'Etiqueta lifecycle para contactos que aun no compran.',
    NULL,
    20,
    true,
    NOW(),
    NOW()
  ),
  (
    'CLIENTE_NUEVO',
    'Cliente Nuevo',
    '#FF9800',
    'Etiqueta lifecycle para clientes con primera compra.',
    NULL,
    21,
    true,
    NOW(),
    NOW()
  ),
  (
    'CLIENTE_RECURRENTE',
    'Cliente Recurrente',
    '#8BC34A',
    'Etiqueta lifecycle para clientes con compras recurrentes.',
    NULL,
    22,
    true,
    NOW(),
    NOW()
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  color = EXCLUDED.color,
  description = EXCLUDED.description,
  commercial_status_key = EXCLUDED.commercial_status_key,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();
