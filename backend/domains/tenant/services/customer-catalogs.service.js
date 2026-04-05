const { getStorageDriver, queryPostgres } = require('../../../config/persistence-runtime');

const DEFAULT_TREATMENTS = Object.freeze([
    { id: '01', code: 'SR', label: 'SEÑOR', abbreviation: 'SR.' },
    { id: '02', code: 'SRA', label: 'SEÑORA', abbreviation: 'SRA.' },
    { id: '03', code: 'SRTA', label: 'SEÑORITA', abbreviation: 'SRTA.' },
    { id: '04', code: 'DR', label: 'DOCTOR', abbreviation: 'DR.' },
    { id: '05', code: 'DRA', label: 'DOCTORA', abbreviation: 'DRA.' },
    { id: '06', code: 'LIC', label: 'LICENCIADA', abbreviation: 'LIC.' },
    { id: '07', code: 'ING', label: 'INGENIERO', abbreviation: 'ING.' },
    { id: '08', code: 'ARQ', label: 'ARQUITECTO (A)', abbreviation: 'ARQ.' },
    { id: '09', code: 'PROF', label: 'PROFESOR (A)', abbreviation: 'PROF.' },
    { id: '10', code: 'D', label: 'DON', abbreviation: 'D.' },
    { id: '11', code: 'DÑA', label: 'DOÑA', abbreviation: 'DÑA.' },
    { id: '12', code: 'MTRO', label: 'MAESTRO', abbreviation: 'MTRO.' },
    { id: '13', code: 'MTRA', label: 'MAESTRA', abbreviation: 'MTRA.' }
]);

const DEFAULT_CUSTOMER_TYPES = Object.freeze([
    { id: '1', label: 'PERSONA NATURAL' },
    { id: '2', label: 'PERSONA JURIDICA' },
    { id: '3', label: 'DISTRIBUIDOR' },
    { id: '4', label: 'MAYORISTA' },
    { id: '5', label: 'ALIADO LAVITAT' }
]);

const DEFAULT_ACQUISITION_SOURCES = Object.freeze([
    { id: '1', label: 'CANAL DIGITAL' },
    { id: '2', label: 'CANAL WEB' },
    { id: '3', label: 'CANAL TRADICIONAL' }
]);

const DEFAULT_DOCUMENT_TYPES = Object.freeze([
    { id: '-', code: '-', label: 'SIN DOCUMENTO', abbreviation: 'SIN DOCUMENTO' },
    { id: '0', code: '0', label: 'DOC.TRIB.NO.DOM.SIN.RUC', abbreviation: 'DOC. TRIB. NO DOM. SIN RUC' },
    { id: '1', code: '1', label: 'DOCUMENTO NACIONAL DE IDENTIDAD', abbreviation: 'DNI' },
    { id: '4', code: '4', label: 'CARNET DE EXTRANJERIA', abbreviation: 'CARNE EXT.' },
    { id: '6', code: '6', label: 'REGISTRO UNICO DE CONTRIBUYENTES', abbreviation: 'RUC' },
    { id: '7', code: '7', label: 'PASAPORTE', abbreviation: 'PASAPORTE' },
    { id: 'A', code: 'A', label: 'CEDULA DIPLOMATICA DE IDENTIDAD', abbreviation: 'C. DIPLOMAT. IDENT.' },
    { id: 'B', code: 'B', label: 'DOC.IDENT.PAIS.RESIDENCIA-NO.D', abbreviation: 'DOC.IDENT.PAIS.RESIDENCIA-NO.D' },
    { id: 'C', code: 'C', label: 'Tax Identification Number – TIN – Doc Trib PP.NN', abbreviation: 'TIN' },
    { id: 'D', code: 'D', label: 'Identification Number – IN – Doc Trib PP. JJ', abbreviation: 'IN' }
]);

function toText(value = '') {
    return String(value || '').trim();
}

function toRow(input = {}) {
    return {
        id: toText(input.id),
        code: toText(input.code),
        label: toText(input.label),
        abbreviation: toText(input.abbreviation)
    };
}

function toCustomerTypeRow(input = {}) {
    return {
        id: toText(input.id),
        label: toText(input.label)
    };
}

function missingRelation(error) {
    return String(error?.code || '').trim() === '42P01';
}

async function getTreatments() {
    if (getStorageDriver() === 'postgres') {
        try {
            const result = await queryPostgres(
                `SELECT id, code, label, abbreviation
                 FROM global_customer_treatments
                 WHERE is_active = TRUE
                 ORDER BY id ASC`
            );
            return (result?.rows || []).map((row) => toRow(row));
        } catch (error) {
            if (!missingRelation(error)) throw error;
        }
    }
    return DEFAULT_TREATMENTS.map((item) => ({ ...item }));
}

async function getCustomerTypes() {
    if (getStorageDriver() === 'postgres') {
        try {
            const result = await queryPostgres(
                `SELECT id, label
                 FROM global_customer_types
                 WHERE is_active = TRUE
                 ORDER BY id ASC`
            );
            return (result?.rows || []).map((row) => toCustomerTypeRow(row));
        } catch (error) {
            if (!missingRelation(error)) throw error;
        }
    }
    return DEFAULT_CUSTOMER_TYPES.map((item) => ({ ...item }));
}

async function getAcquisitionSources() {
    if (getStorageDriver() === 'postgres') {
        try {
            const result = await queryPostgres(
                `SELECT id, label
                 FROM global_acquisition_sources
                 WHERE is_active = TRUE
                 ORDER BY id ASC`
            );
            return (result?.rows || []).map((row) => toCustomerTypeRow(row));
        } catch (error) {
            if (!missingRelation(error)) throw error;
        }
    }
    return DEFAULT_ACQUISITION_SOURCES.map((item) => ({ ...item }));
}

async function getDocumentTypes() {
    if (getStorageDriver() === 'postgres') {
        try {
            const result = await queryPostgres(
                `SELECT id, code, label, abbreviation
                 FROM global_document_types
                 WHERE is_active = TRUE
                 ORDER BY id ASC`
            );
            return (result?.rows || []).map((row) => toRow(row));
        } catch (error) {
            if (!missingRelation(error)) throw error;
        }
    }
    return DEFAULT_DOCUMENT_TYPES.map((item) => ({ ...item }));
}

module.exports = {
    getTreatments,
    getCustomerTypes,
    getAcquisitionSources,
    getDocumentTypes
};
