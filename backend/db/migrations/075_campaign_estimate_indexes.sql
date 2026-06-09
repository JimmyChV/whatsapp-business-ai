-- Indice funcional para LOWER(module_id) en contextos
-- Elimina Seq Scan en la query de estimacion de campanas
CREATE INDEX IF NOT EXISTS idx_customer_module_ctx_lower_module
  ON tenant_customer_module_contexts (tenant_id, LOWER(module_id));

-- Indice funcional para LOWER(module_id) en clientes
CREATE INDEX IF NOT EXISTS idx_customers_lower_module
  ON tenant_customers (tenant_id, LOWER(module_id));
