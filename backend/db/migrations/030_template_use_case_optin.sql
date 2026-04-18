-- 030_template_use_case_optin.sql
-- Agrega el nuevo use_case optin para templates de consentimiento / alta comercial.

ALTER TABLE tenant_meta_templates
    DROP CONSTRAINT IF EXISTS tenant_meta_templates_use_case_check;

ALTER TABLE tenant_meta_templates
    ADD CONSTRAINT tenant_meta_templates_use_case_check
    CHECK (use_case IN ('campaign', 'individual', 'both', 'optin'));
