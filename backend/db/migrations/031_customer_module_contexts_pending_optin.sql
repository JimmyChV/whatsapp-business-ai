-- 031_customer_module_contexts_pending_optin.sql
-- Permite el estado pending para workflows de outreach / opt-in.

ALTER TABLE tenant_customer_module_contexts
    DROP CONSTRAINT IF EXISTS tenant_customer_module_contexts_marketing_opt_in_status_check;

ALTER TABLE tenant_customer_module_contexts
    ADD CONSTRAINT tenant_customer_module_contexts_marketing_opt_in_status_check
    CHECK (marketing_opt_in_status IN ('unknown', 'pending', 'opted_in', 'opted_out'));
