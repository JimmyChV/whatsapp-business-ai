ALTER TABLE tenant_schedules
  ADD COLUMN IF NOT EXISTS welcome_message TEXT,
  ADD COLUMN IF NOT EXISTS away_message TEXT,
  ADD COLUMN IF NOT EXISTS welcome_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS away_enabled BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN tenant_schedules.welcome_message IS 'Mensaje automatico enviado cuando un cliente escribe por primera vez dentro del horario de atencion.';
COMMENT ON COLUMN tenant_schedules.away_message IS 'Mensaje automatico enviado cuando un cliente escribe fuera del horario de atencion.';
COMMENT ON COLUMN tenant_schedules.welcome_enabled IS 'Activa o desactiva el mensaje automatico de bienvenida.';
COMMENT ON COLUMN tenant_schedules.away_enabled IS 'Activa o desactiva el mensaje automatico de ausencia.';
