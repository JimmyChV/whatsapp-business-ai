BEGIN;

INSERT INTO global_customer_treatments (id, code, label, abbreviation) VALUES
    ('01', 'SR', 'SEÑOR', 'SR.'),
    ('02', 'SRA', 'SEÑORA', 'SRA.'),
    ('03', 'SRTA', 'SEÑORITA', 'SRTA.'),
    ('04', 'DR', 'DOCTOR', 'DR.'),
    ('05', 'DRA', 'DOCTORA', 'DRA.'),
    ('06', 'LIC', 'LICENCIADA', 'LIC.'),
    ('07', 'ING', 'INGENIERO', 'ING.'),
    ('08', 'ARQ', 'ARQUITECTO (A)', 'ARQ.'),
    ('09', 'PROF', 'PROFESOR (A)', 'PROF.'),
    ('10', 'D', 'DON', 'D.'),
    ('11', 'DÑA', 'DOÑA', 'DÑA.'),
    ('12', 'MTRO', 'MAESTRO', 'MTRO.'),
    ('13', 'MTRA', 'MAESTRA', 'MTRA.')
ON CONFLICT DO NOTHING;

INSERT INTO global_customer_types (id, label) VALUES
    ('1', 'PERSONA NATURAL'),
    ('2', 'PERSONA JURIDICA'),
    ('3', 'DISTRIBUIDOR'),
    ('4', 'MAYORISTA'),
    ('5', 'ALIADO LAVITAT')
ON CONFLICT DO NOTHING;

INSERT INTO global_acquisition_sources (id, label) VALUES
    ('1', 'CANAL DIGITAL'),
    ('2', 'CANAL WEB'),
    ('3', 'CANAL TRADICIONAL')
ON CONFLICT DO NOTHING;

INSERT INTO global_document_types (id, code, label, abbreviation) VALUES
    ('-', '-', 'SIN DOCUMENTO', 'SIN DOCUMENTO'),
    ('0', '0', 'DOC.TRIB.NO.DOM.SIN.RUC', 'DOC. TRIB. NO DOM. SIN RUC'),
    ('1', '1', 'DOCUMENTO NACIONAL DE IDENTIDAD', 'DNI'),
    ('4', '4', 'CARNET DE EXTRANJERIA', 'CARNE EXT.'),
    ('6', '6', 'REGISTRO UNICO DE CONTRIBUYENTES', 'RUC'),
    ('7', '7', 'PASAPORTE', 'PASAPORTE'),
    ('A', 'A', 'CEDULA DIPLOMATICA DE IDENTIDAD', 'C. DIPLOMAT. IDENT.'),
    ('B', 'B', 'DOC.IDENT.PAIS.RESIDENCIA-NO.D', 'DOC.IDENT.PAIS.RESIDENCIA-NO.D'),
    ('C', 'C', 'Tax Identification Number – TIN – Doc Trib PP.NN', 'TIN'),
    ('D', 'D', 'Identification Number – IN – Doc Trib PP. JJ', 'IN')
ON CONFLICT DO NOTHING;

COMMIT;

