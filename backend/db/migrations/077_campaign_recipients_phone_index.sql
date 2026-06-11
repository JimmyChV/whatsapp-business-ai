-- Indice para lookup batch phone -> campaigns
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_phone
  ON tenant_campaign_recipients (tenant_id, phone)
  WHERE phone IS NOT NULL AND phone <> '';
