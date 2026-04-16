-- 028_template_use_case.sql
-- Agrega use_case para separar templates de campana vs envio individual.

BEGIN;

ALTER TABLE tenant_meta_templates
    ADD COLUMN IF NOT EXISTS use_case TEXT NOT NULL DEFAULT 'both';

ALTER TABLE tenant_meta_templates
    DROP CONSTRAINT IF EXISTS tenant_meta_templates_use_case_check;

ALTER TABLE tenant_meta_templates
    ADD CONSTRAINT tenant_meta_templates_use_case_check
    CHECK (use_case IN ('campaign', 'individual', 'both'));

COMMIT;
