-- Normalizar tenant_customers
UPDATE tenant_customers SET
  first_name         = CASE WHEN first_name IS NOT NULL THEN UPPER(TRIM(first_name)) ELSE first_name END,
  last_name_paternal = CASE WHEN last_name_paternal IS NOT NULL THEN UPPER(TRIM(last_name_paternal)) ELSE last_name_paternal END,
  last_name_maternal = CASE WHEN last_name_maternal IS NOT NULL THEN UPPER(TRIM(last_name_maternal)) ELSE last_name_maternal END,
  contact_name       = CASE WHEN contact_name IS NOT NULL THEN UPPER(TRIM(contact_name)) ELSE contact_name END,
  document_number    = CASE WHEN document_number IS NOT NULL THEN UPPER(TRIM(document_number)) ELSE document_number END,
  phone_e164         = CASE WHEN phone_e164 IS NOT NULL THEN TRIM(phone_e164) ELSE phone_e164 END,
  phone_alt          = CASE WHEN phone_alt IS NOT NULL THEN TRIM(phone_alt) ELSE phone_alt END,
  notes              = CASE WHEN notes IS NOT NULL THEN UPPER(TRIM(notes)) ELSE notes END;

-- Normalizar tenant_customer_addresses
UPDATE tenant_customer_addresses SET
  street          = CASE WHEN street IS NOT NULL THEN UPPER(TRIM(street)) ELSE street END,
  reference       = CASE WHEN reference IS NOT NULL THEN UPPER(TRIM(reference)) ELSE reference END,
  district_name   = CASE WHEN district_name IS NOT NULL THEN UPPER(TRIM(district_name)) ELSE district_name END,
  province_name   = CASE WHEN province_name IS NOT NULL THEN UPPER(TRIM(province_name)) ELSE province_name END,
  department_name = CASE WHEN department_name IS NOT NULL THEN UPPER(TRIM(department_name)) ELSE department_name END;

-- Normalizar global_customer_treatments (label y abbreviation)
UPDATE global_customer_treatments SET
  label        = UPPER(TRIM(label)),
  abbreviation = UPPER(TRIM(abbreviation));

-- Normalizar global_customer_types
UPDATE global_customer_types SET label = UPPER(TRIM(label));

-- Normalizar global_document_types
UPDATE global_document_types SET
  label        = UPPER(TRIM(label)),
  abbreviation = UPPER(TRIM(abbreviation));

-- Normalizar global_acquisition_sources
UPDATE global_acquisition_sources SET label = UPPER(TRIM(label));

-- Normalizar tenant_labels (etiquetas del tenant)
UPDATE tenant_labels SET name = UPPER(TRIM(name)) WHERE name IS NOT NULL;

-- Normalizar tenant_zone_rules
UPDATE tenant_zone_rules SET name = UPPER(TRIM(name)) WHERE name IS NOT NULL;

-- Normalizar global_labels (estados comerciales — mantener capitalización correcta)
UPDATE global_labels SET
  name = CASE commercial_status_key
    WHEN 'nuevo'           THEN 'NUEVO'
    WHEN 'en_conversacion' THEN 'EN CONVERSACIÓN'
    WHEN 'cotizado'        THEN 'COTIZADO'
    WHEN 'vendido'         THEN 'VENDIDO'
    WHEN 'perdido'         THEN 'PERDIDO'
    ELSE UPPER(TRIM(name))
  END;
