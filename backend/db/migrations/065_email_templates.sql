CREATE TABLE IF NOT EXISTS tenant_email_templates (
  id           SERIAL PRIMARY KEY,
  tenant_id    TEXT NOT NULL,
  template_key TEXT NOT NULL,
  subject      TEXT,
  body_html    TEXT,
  is_custom    BOOLEAN DEFAULT FALSE,
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_by   TEXT,
  UNIQUE(tenant_id, template_key)
);

CREATE TABLE IF NOT EXISTS tenant_email_brand (
  tenant_id    TEXT PRIMARY KEY,
  logo_url     TEXT,
  brand_color  TEXT DEFAULT '#1D9E75',
  company_name TEXT,
  footer_text  TEXT,
  website_url  TEXT,
  social_links JSONB DEFAULT '{}',
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
