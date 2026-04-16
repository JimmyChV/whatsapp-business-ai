-- 029_template_variable_map.sql
-- Persist semantic-to-sequential placeholder maps for Meta templates.

ALTER TABLE tenant_meta_templates
    ADD COLUMN IF NOT EXISTS variable_map_json JSONB NOT NULL DEFAULT '{}'::jsonb;
