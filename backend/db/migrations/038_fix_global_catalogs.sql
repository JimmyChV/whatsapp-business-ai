WITH seed_treatments (id, code, label, abbreviation, is_active) AS (
  VALUES
    ('1',  '01', 'SEÑOR',          'SR.',   true),
    ('2',  '02', 'SEÑORA',         'SRA.',  true),
    ('3',  '03', 'SEÑORITA',       'SRTA.', true),
    ('4',  '04', 'DOCTOR',         'DR.',   true),
    ('5',  '05', 'DOCTORA',        'DRA.',  true),
    ('6',  '06', 'LICENCIADA',     'LIC.',  true),
    ('7',  '07', 'INGENIERO',      'ING.',  true),
    ('8',  '08', 'ARQUITECTO (A)', 'ARQ.',  true),
    ('9',  '09', 'PROFESOR (A)',   'PROF.', true),
    ('10', '10', 'DON',            'D.',    true),
    ('11', '11', 'DOÑA',           'DÑA.',  true),
    ('12', '12', 'MAESTRO',        'MTRO.', true),
    ('13', '13', 'MAESTRA',        'MTRA.', true)
)
INSERT INTO global_customer_treatments (id, code, label, abbreviation, is_active)
SELECT id, code, label, abbreviation, is_active
FROM seed_treatments
ON CONFLICT (id) DO UPDATE
SET code = EXCLUDED.code,
    label = EXCLUDED.label,
    abbreviation = EXCLUDED.abbreviation,
    is_active = EXCLUDED.is_active;

WITH seed_document_types (id, code, label, abbreviation, is_active) AS (
  VALUES
    ('-', '-',  'SIN DOCUMENTO',                     'SIN DOC.',   true),
    ('0', '0',  'DOC.TRIB.NO.DOM.SIN.RUC',          'TRIB.EXT.',  true),
    ('1', '1',  'DOCUMENTO NACIONAL DE IDENTIDAD',  'DNI',        true),
    ('4', '4',  'CARNET DE EXTRANJERÍA',            'C.EXT.',     true),
    ('6', '6',  'REGISTRO ÚNICO DE CONTRIBUYENTES', 'RUC',        true),
    ('7', '7',  'PASAPORTE',                        'PASAPORTE',  true),
    ('A', 'A',  'CÉDULA DIPLOMÁTICA DE IDENTIDAD',  'C.DIPL.',    true),
    ('B', 'B',  'DOC.IDENT.PAÍS.RESIDENCIA-NO.D',   'IDENT.EXT.', true),
    ('C', 'C',  'Tax Identification Number (TIN)',  'TIN',        true),
    ('D', 'D',  'Identification Number (IN)',       'IN',         true)
)
INSERT INTO global_document_types (id, code, label, abbreviation, is_active)
SELECT id, code, label, abbreviation, is_active
FROM seed_document_types
ON CONFLICT (id) DO UPDATE
SET code = EXCLUDED.code,
    label = EXCLUDED.label,
    abbreviation = EXCLUDED.abbreviation,
    is_active = EXCLUDED.is_active;

WITH seed_customer_types (id, label, is_active) AS (
  VALUES
    ('1', 'PERSONA NATURAL',  true),
    ('2', 'PERSONA JURÍDICA', true),
    ('3', 'DISTRIBUIDOR',     true),
    ('4', 'MAYORISTA',        true),
    ('5', 'ALIADO LÁVITAT',   true)
)
INSERT INTO global_customer_types (id, label, is_active)
SELECT id, label, is_active
FROM seed_customer_types
ON CONFLICT (id) DO UPDATE
SET label = EXCLUDED.label,
    is_active = EXCLUDED.is_active;

WITH seed_acquisition_sources (id, label, is_active) AS (
  VALUES
    ('1', 'REDES SOCIALES',    true),
    ('2', 'REFERIDOS',         true),
    ('3', 'CONTACTOS',         true),
    ('4', 'CANAL DIGITAL',     true),
    ('5', 'CANAL WEB',         true),
    ('6', 'CANAL TRADICIONAL', true)
)
INSERT INTO global_acquisition_sources (id, label, is_active)
SELECT id, label, is_active
FROM seed_acquisition_sources
ON CONFLICT (id) DO UPDATE
SET label = EXCLUDED.label,
    is_active = EXCLUDED.is_active;

UPDATE global_labels SET name = 'Nuevo'            WHERE commercial_status_key = 'nuevo';
UPDATE global_labels SET name = 'En conversación'  WHERE commercial_status_key = 'en_conversacion';
UPDATE global_labels SET name = 'Cotizado'         WHERE commercial_status_key = 'cotizado';
UPDATE global_labels SET name = 'Vendido'          WHERE commercial_status_key = 'vendido';
UPDATE global_labels SET name = 'Perdido'          WHERE commercial_status_key = 'perdido';
