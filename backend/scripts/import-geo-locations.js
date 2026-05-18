#!/usr/bin/env node
const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
require('dotenv').config({ quiet: true });

const { queryPostgres } = require('../config/persistence-runtime');
const { parseCsvRows } = require('../domains/tenant/helpers/customers-normalizers.helpers');

const DEFAULT_ERP_DIR = path.join(__dirname, '..', 'config', 'data', 'erp');
const SOURCE = 'erp_csv';

function text(value = '') {
    return String(value || '').trim();
}

function normalizeName(value = '') {
    return text(value)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeHeader(value = '') {
    return normalizeName(value).replace(/\s+/g, '');
}

function normalizeNumericKey(value = '') {
    const clean = text(value);
    if (!clean) return '';
    const parsed = Number.parseInt(clean, 10);
    return Number.isFinite(parsed) ? String(parsed) : clean;
}

function padCode(value = '', size = 2) {
    const clean = text(value);
    if (!clean) return '';
    if (/^\d+$/.test(clean)) return clean.padStart(size, '0');
    return clean;
}

function readCsvText(csvPath = '') {
    const buffer = fs.readFileSync(csvPath);
    const utf8 = buffer.toString('utf8');
    const latin1 = buffer.toString('latin1');
    const maybeMojibake = /Ãƒ.|Ã¢.|ï¿½/.test(utf8);
    return maybeMojibake ? latin1 : utf8;
}

function parseCsvObjects(csvPath = '') {
    const rows = parseCsvRows(readCsvText(csvPath), ',');
    if (!Array.isArray(rows) || rows.length < 2) return [];
    const headers = rows[0].map(normalizeHeader);
    return rows.slice(1).map((row) => {
        const out = {};
        headers.forEach((header, index) => {
            out[header] = text(row[index] || '');
        });
        return out;
    });
}

function findCsvByToken(dirPath = '', token = '') {
    const target = normalizeHeader(token);
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.csv')) continue;
        if (normalizeHeader(entry.name).includes(target)) return path.join(dirPath, entry.name);
    }
    return '';
}

function parseArgs(argv = []) {
    const args = { dir: DEFAULT_ERP_DIR };
    for (let index = 0; index < argv.length; index += 1) {
        const token = text(argv[index]);
        if (token.startsWith('--dir=')) {
            args.dir = path.resolve(token.split('=').slice(1).join('=').trim());
            continue;
        }
        if (token === '--dir') {
            args.dir = path.resolve(text(argv[index + 1]) || DEFAULT_ERP_DIR);
            index += 1;
        }
    }
    args.dir = path.resolve(args.dir || DEFAULT_ERP_DIR);
    return args;
}

function buildLocations({ departmentsRaw = [], provincesRaw = [], districtsRaw = [] } = {}) {
    const departments = [];
    const provinces = [];
    const districts = [];
    const departmentCodeByRawId = new Map();
    const provinceCodeByRawId = new Map();

    departmentsRaw.forEach((row) => {
        const rawId = normalizeNumericKey(row.iddepartamento);
        const code = padCode(row.codigodepartamento || rawId, 2);
        const name = text(row.departamento);
        if (!rawId || !code || !name) return;
        departmentCodeByRawId.set(rawId, code);
        departments.push({
            id: `DEP_${code}`,
            type: 'department',
            name,
            normalizedName: normalizeName(name),
            parentId: null,
            ubigeo: code
        });
    });

    provincesRaw.forEach((row) => {
        const rawId = normalizeNumericKey(row.idprovincia);
        const departmentRawId = normalizeNumericKey(row.iddepartamento);
        const departmentCode = departmentCodeByRawId.get(departmentRawId);
        const code = padCode(row.codigoprovincia, 4);
        const name = text(row.provincia);
        if (!rawId || !departmentCode || !code || !name) return;
        provinceCodeByRawId.set(rawId, code);
        provinces.push({
            id: `PROV_${code}`,
            type: 'province',
            name,
            normalizedName: normalizeName(name),
            parentId: `DEP_${departmentCode}`,
            ubigeo: code
        });
    });

    districtsRaw.forEach((row) => {
        const provinceRawId = normalizeNumericKey(row.idprovincia);
        const provinceCode = provinceCodeByRawId.get(provinceRawId);
        const code = padCode(row.iddistrito, 6);
        const name = text(row.distrito);
        if (!provinceCode || !code || !name) return;
        districts.push({
            id: `DIST_${code}`,
            type: 'district',
            name,
            normalizedName: normalizeName(name),
            parentId: `PROV_${provinceCode}`,
            ubigeo: code
        });
    });

    return { departments, provinces, districts };
}

async function upsertLocations(locations = []) {
    if (!Array.isArray(locations) || locations.length === 0) return 0;
    let total = 0;
    const chunkSize = 500;
    for (let start = 0; start < locations.length; start += chunkSize) {
        const chunk = locations.slice(start, start + chunkSize);
        const valuesSql = [];
        const params = [];
        chunk.forEach((item, index) => {
            const base = index * 8;
            valuesSql.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`);
            params.push(
                item.id,
                item.type,
                item.name,
                item.normalizedName,
                item.parentId,
                item.ubigeo,
                SOURCE,
                true
            );
        });
        const result = await queryPostgres(
            `INSERT INTO geo_locations (
                id, type, name, normalized_name, parent_id, ubigeo, source, is_active
            ) VALUES ${valuesSql.join(', ')}
            ON CONFLICT (id) DO UPDATE SET
                type = EXCLUDED.type,
                name = EXCLUDED.name,
                normalized_name = EXCLUDED.normalized_name,
                parent_id = EXCLUDED.parent_id,
                ubigeo = EXCLUDED.ubigeo,
                source = EXCLUDED.source,
                is_active = EXCLUDED.is_active,
                updated_at = NOW()`,
            params
        );
        total += Number(result?.rowCount || 0);
    }
    return total;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const departmentsCsv = findCsvByToken(args.dir, 'tbdepartamentos');
    const provincesCsv = findCsvByToken(args.dir, 'tbprovincias');
    const districtsCsv = findCsvByToken(args.dir, 'tbdistritos');

    if (!departmentsCsv || !provincesCsv || !districtsCsv) {
        throw new Error(`No se encontraron CSV geograficos completos en ${args.dir}`);
    }

    const locations = buildLocations({
        departmentsRaw: parseCsvObjects(departmentsCsv),
        provincesRaw: parseCsvObjects(provincesCsv),
        districtsRaw: parseCsvObjects(districtsCsv)
    });

    try {
        const departmentCount = await upsertLocations(locations.departments);
        const provinceCount = await upsertLocations(locations.provinces);
        const districtCount = await upsertLocations(locations.districts);
        console.log(JSON.stringify({
            ok: true,
            sourceDir: args.dir,
            counts: {
                departments: locations.departments.length,
                provinces: locations.provinces.length,
                districts: locations.districts.length
            },
            upserted: {
                departments: departmentCount,
                provinces: provinceCount,
                districts: districtCount
            }
        }, null, 2));
    } catch (error) {
        throw error;
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error?.message || error);
        process.exitCode = 1;
    });
}

module.exports = {
    buildLocations,
    normalizeName
};
