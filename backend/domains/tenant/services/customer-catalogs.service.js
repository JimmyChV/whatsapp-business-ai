const fs = require('fs');
const path = require('path');
const { getStorageDriver, queryPostgres } = require('../../../config/persistence-runtime');
const { parseCsvRows } = require('../helpers/customers-normalizers.helpers');

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

let geoCatalogCache = null;

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

function normalizeHeader(value = '') {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '');
}

function readCsvText(csvPath = '') {
    const buffer = fs.readFileSync(csvPath);
    const utf8 = buffer.toString('utf8');
    const latin1 = buffer.toString('latin1');
    const maybeMojibake = /Ãƒ.|Ã¢.|ï¿½/.test(utf8);
    return maybeMojibake ? latin1 : utf8;
}

function parseCsvObjects(csvPath = '') {
    if (!csvPath || !fs.existsSync(csvPath)) return [];
    const rows = parseCsvRows(readCsvText(csvPath), ',');
    if (!Array.isArray(rows) || rows.length < 2) return [];
    const headers = (rows[0] || []).map((entry) => normalizeHeader(entry));
    return rows.slice(1).map((row) => {
        const out = {};
        headers.forEach((header, idx) => {
            out[header] = toText(row[idx] || '');
        });
        return out;
    });
}

function findCsvByToken(dirPath = '', token = '') {
    const target = normalizeHeader(token);
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!entry.name.toLowerCase().endsWith('.csv')) continue;
        const normalizedName = normalizeHeader(entry.name);
        if (normalizedName.includes(target)) return path.join(dirPath, entry.name);
    }
    return '';
}

function normalizeNumericKey(value = '') {
    const text = toText(value);
    if (!text) return '';
    const parsed = Number.parseInt(text, 10);
    return Number.isFinite(parsed) ? String(parsed) : text;
}

function normalizeDistrictId(value = '') {
    const text = toText(value);
    if (!text) return '';
    if (/^\d+$/.test(text)) return text.padStart(6, '0');
    return text;
}

function loadGeoCatalogFromCsv() {
    if (geoCatalogCache) return geoCatalogCache;

    const erpDir = path.resolve(__dirname, '../../../config/data/erp');
    if (!fs.existsSync(erpDir)) {
        geoCatalogCache = { departments: [], provinces: [], districts: [] };
        return geoCatalogCache;
    }

    const departmentsCsv = findCsvByToken(erpDir, 'tbdepartamentos');
    const provincesCsv = findCsvByToken(erpDir, 'tbprovincias');
    const districtsCsv = findCsvByToken(erpDir, 'tbdistritos');

    const departmentsRaw = parseCsvObjects(departmentsCsv);
    const provincesRaw = parseCsvObjects(provincesCsv);
    const districtsRaw = parseCsvObjects(districtsCsv);

    const departments = departmentsRaw
        .map((row) => ({
            id: normalizeNumericKey(row.iddepartamento),
            name: toText(row.departamento)
        }))
        .filter((row) => row.id && row.name)
        .sort((a, b) => a.name.localeCompare(b.name, 'es'));

    const provinces = provincesRaw
        .map((row) => ({
            id: normalizeNumericKey(row.idprovincia),
            departmentId: normalizeNumericKey(row.iddepartamento),
            name: toText(row.provincia)
        }))
        .filter((row) => row.id && row.departmentId && row.name)
        .sort((a, b) => a.name.localeCompare(b.name, 'es'));

    const provinceById = new Map(provinces.map((item) => [item.id, item]));

    const districts = districtsRaw
        .map((row) => {
            const provinceId = normalizeNumericKey(row.idprovincia);
            const province = provinceById.get(provinceId) || null;
            return {
                id: normalizeDistrictId(row.iddistrito),
                provinceId,
                departmentId: province?.departmentId || '',
                name: toText(row.distrito)
            };
        })
        .filter((row) => row.id && row.provinceId && row.departmentId && row.name)
        .sort((a, b) => a.name.localeCompare(b.name, 'es'));

    geoCatalogCache = { departments, provinces, districts };
    return geoCatalogCache;
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

async function getGeoCatalog(options = {}) {
    const source = loadGeoCatalogFromCsv();
    const departmentId = normalizeNumericKey(options?.departmentId || '');
    const provinceId = normalizeNumericKey(options?.provinceId || '');

    const departments = Array.isArray(source.departments) ? [...source.departments] : [];
    let provinces = Array.isArray(source.provinces) ? [...source.provinces] : [];
    let districts = Array.isArray(source.districts) ? [...source.districts] : [];

    if (departmentId) {
        provinces = provinces.filter((item) => item.departmentId === departmentId);
        districts = districts.filter((item) => item.departmentId === departmentId);
    }

    if (provinceId) {
        districts = districts.filter((item) => item.provinceId === provinceId);
    }

    return { departments, provinces, districts };
}

module.exports = {
    getTreatments,
    getCustomerTypes,
    getAcquisitionSources,
    getDocumentTypes,
    getGeoCatalog
};
