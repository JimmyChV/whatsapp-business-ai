-- Indice para LATERAL de etiquetas operativas
-- en query de estimacion de campanas
CREATE INDEX IF NOT EXISTS idx_tenant_chat_labels_label_id
  ON tenant_chat_labels (tenant_id, label_id);
