-- 021_chat_assignment_lifecycle.sql
-- Lifecycle de asignaciones: actividad, espera e inactividad.

BEGIN;

ALTER TABLE tenant_chat_assignments
    ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS last_customer_message_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS waiting_since TIMESTAMPTZ NULL;

-- Backfill inicial seguro para no dejar nulos "operativos" en historicos activos.
UPDATE tenant_chat_assignments
   SET last_activity_at = COALESCE(last_activity_at, updated_at)
 WHERE status = 'active'
   AND last_activity_at IS NULL;

UPDATE tenant_chat_assignments
   SET waiting_since = COALESCE(waiting_since, updated_at)
 WHERE status = 'en_espera'
   AND waiting_since IS NULL;

-- Dominio de status congelado.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'chk_tenant_chat_assignments_status_lifecycle'
    ) THEN
        ALTER TABLE tenant_chat_assignments
            ADD CONSTRAINT chk_tenant_chat_assignments_status_lifecycle
            CHECK (status IN ('active', 'released', 'en_espera'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tenant_chat_assignments_activity
    ON tenant_chat_assignments(tenant_id, scope_module_id, status, last_activity_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_chat_assignments_waiting
    ON tenant_chat_assignments(tenant_id, status, waiting_since DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_chat_assignments_customer_last_msg
    ON tenant_chat_assignments(tenant_id, scope_module_id, last_customer_message_at DESC);

COMMIT;
