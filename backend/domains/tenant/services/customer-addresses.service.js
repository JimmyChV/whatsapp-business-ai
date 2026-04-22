const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    readTenantJsonFile,
    writeTenantJsonFile,
    queryPostgres
} = require('../../../config/persistence-runtime');
const { parseCsvRows } = require('../helpers/customers-normalizers.helpers');

const STORE_FILE = 'customer_addresses.json';
const ALLOWED_ADDRESS_TYPES = new Set(['fiscal', 'delivery', 'other']);
let schemaPromise = null;
let geoLookupCache = null;

function nowIso() {
    return new Date().toISOString();
}

function toText(value = '') {
    return String(value || '').trim();
}

function toNullableText(value = '') {
    const text = toText(value);
    return text || null;
}

function toBool(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (value === 1 || value === '1') return true;
    if (value === 0 || value === '0') return false;
    if (typeof value === 'string') {
        const raw = value.trim().toLowerCase();
        if (['true', 'yes', 'on'].includes(raw)) return true;
        if (['false', 'no', 'off'].includes(raw)) return false;
    }
    return fallback;
}

function toNumericOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function toIsoText(value = '') {
    if (value instanceof Date) {
        return Number.isFinite(value.getTime()) ? value.toISOString() : null;
    }
    const raw = toText(value);
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function normalizeTenant(tenantId = DEFAULT_TENANT_ID) {
    return normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
}

function normalizeAddressType(value = '') {
    const type = toText(value).toLowerCase();
    if (ALLOWED_ADDRESS_TYPES.has(type)) return type;
    return 'other';
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

function normalizeDistrictKey(value = '') {
    const text = toText(value);
    if (!text) return '';
    if (!/^\d+$/.test(text)) return text;
    return text.padStart(6, '0');
}

function isLikelyGeoCode(value = '') {
    const text = toText(value);
    if (!text) return false;
    return /^\d{1,6}$/.test(text);
}

function normalizeNumericKey(value = '') {
    const text = toText(value);
    if (!text) return '';
    const numeric = Number.parseInt(text, 10);
    return Number.isFinite(numeric) ? String(numeric) : text;
}

function findCsvByToken(dirPath = '', token = '') {
    const target = normalizeHeader(token);
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!entry.name.toLowerCase().endsWith('.csv')) continue;
        const normalized = normalizeHeader(entry.name);
        if (normalized.includes(target)) return path.join(dirPath, entry.name);
    }
    return '';
}

function parseCsvObjects(csvPath = '') {
    if (!csvPath || !fs.existsSync(csvPath)) return [];
    const rows = parseCsvRows(readCsvText(csvPath), ',');
    if (!Array.isArray(rows) || rows.length < 2) return [];
    const headers = (rows[0] || []).map((entry) => normalizeHeader(entry));
    return rows.slice(1).map((row) => {
        const obj = {};
        headers.forEach((header, idx) => {
            obj[header] = toText(row[idx] || '');
        });
        return obj;
    });
}

function loadGeoLookup() {
    if (geoLookupCache) return geoLookupCache;

    const erpDir = path.resolve(__dirname, '../../../config/data/erp');
    if (!fs.existsSync(erpDir)) {
        geoLookupCache = { districts: new Map() };
        return geoLookupCache;
    }

    const districtsCsv = findCsvByToken(erpDir, 'tbdistritos');
    const provincesCsv = findCsvByToken(erpDir, 'tbprovincias');
    const departmentsCsv = findCsvByToken(erpDir, 'tbdepartamentos');

    const departmentRows = parseCsvObjects(departmentsCsv);
    const provinceRows = parseCsvObjects(provincesCsv);
    const districtRows = parseCsvObjects(districtsCsv);

    const departmentById = new Map();
    for (const row of departmentRows) {
        const depId = normalizeNumericKey(row.iddepartamento);
        if (!depId) continue;
        departmentById.set(depId, {
            id: depId,
            name: toText(row.departamento)
        });
    }

    const provinceById = new Map();
    for (const row of provinceRows) {
        const provId = normalizeNumericKey(row.idprovincia);
        if (!provId) continue;
        const depId = normalizeNumericKey(row.iddepartamento);
        provinceById.set(provId, {
            id: provId,
            name: toText(row.provincia),
            departmentId: depId
        });
    }

    const districts = new Map();
    for (const row of districtRows) {
        const districtId = normalizeDistrictKey(row.iddistrito);
        if (!districtId) continue;
        const provId = normalizeNumericKey(row.idprovincia);
        const province = provinceById.get(provId) || null;
        const department = province ? departmentById.get(province.departmentId) || null : null;
        districts.set(districtId, {
            districtName: toText(row.distrito) || null,
            provinceName: toText(province?.name || '') || null,
            departmentName: toText(department?.name || '') || null
        });
    }

    geoLookupCache = { districts };
    return geoLookupCache;
}

function enrichAddressGeo(address = {}) {
    const source = normalizeObject(address);
    const districtName = toText(source.districtName || source.district_name);
    const provinceName = toText(source.provinceName || source.province_name);
    const departmentName = toText(source.departmentName || source.department_name);
    const districtLooksLikeCode = isLikelyGeoCode(districtName);
    const provinceLooksLikeCode = isLikelyGeoCode(provinceName);
    const departmentLooksLikeCode = isLikelyGeoCode(departmentName);
    const hasResolvedGeoNames = districtName && provinceName && departmentName
        && !districtLooksLikeCode
        && !provinceLooksLikeCode
        && !departmentLooksLikeCode;
    if (hasResolvedGeoNames) return source;

    const districtId = normalizeDistrictKey(
        source.districtId
        || source.district_id
        || (districtLooksLikeCode ? districtName : '')
    );
    if (!districtId) return source;

    const lookup = loadGeoLookup();
    const geo = lookup?.districts instanceof Map ? lookup.districts.get(districtId) : null;
    if (!geo) return source;

    return {
        ...source,
        districtId: source.districtId || source.district_id || districtId,
        districtName: districtName || geo.districtName || null,
        provinceName: provinceName || geo.provinceName || null,
        departmentName: departmentName || geo.departmentName || null
    };
}

function normalizeObject(value = {}) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    return {};
}

function ensureArray(value = []) {
    return Array.isArray(value) ? value : [];
}

function randomAddressId() {
    const seed = typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID().replace(/-/g, '')
        : crypto.randomBytes(8).toString('hex');
    return `addr_${seed}`;
}

function normalizeAddress(input = {}, previous = null) {
    const source = normalizeObject(input);
    const base = previous ? normalizeObject(previous) : {};
    const createdAt = toIsoText(source.createdAt || source.created_at || base.createdAt || base.created_at) || nowIso();
    const updatedAt = toIsoText(source.updatedAt || source.updated_at) || nowIso();

    return {
        addressId: toText(source.addressId || source.address_id || base.addressId || base.address_id) || randomAddressId(),
        tenantId: normalizeTenant(source.tenantId || source.tenant_id || base.tenantId || base.tenant_id || DEFAULT_TENANT_ID),
        customerId: toText(source.customerId || source.customer_id || base.customerId || base.customer_id),
        addressType: normalizeAddressType(source.addressType || source.address_type || base.addressType || base.address_type || 'other'),
        street: toNullableText(source.street !== undefined ? source.street : base.street),
        reference: toNullableText(source.reference !== undefined ? source.reference : base.reference),
        mapsUrl: toNullableText(source.mapsUrl !== undefined ? source.mapsUrl : source.maps_url !== undefined ? source.maps_url : base.mapsUrl || base.maps_url),
        wkt: toNullableText(source.wkt !== undefined ? source.wkt : base.wkt),
        latitude: toNumericOrNull(source.latitude !== undefined ? source.latitude : base.latitude),
        longitude: toNumericOrNull(source.longitude !== undefined ? source.longitude : base.longitude),
        isPrimary: toBool(source.isPrimary !== undefined ? source.isPrimary : source.is_primary !== undefined ? source.is_primary : base.isPrimary || base.is_primary, false),
        districtId: toNullableText(source.districtId !== undefined ? source.districtId : source.district_id !== undefined ? source.district_id : base.districtId || base.district_id),
        districtName: toNullableText(source.districtName !== undefined ? source.districtName : source.district_name !== undefined ? source.district_name : base.districtName || base.district_name),
        provinceName: toNullableText(source.provinceName !== undefined ? source.provinceName : source.province_name !== undefined ? source.province_name : base.provinceName || base.province_name),
        departmentName: toNullableText(source.departmentName !== undefined ? source.departmentName : source.department_name !== undefined ? source.department_name : base.departmentName || base.department_name),
        metadata: normalizeObject(source.metadata !== undefined ? source.metadata : base.metadata),
        createdAt,
        updatedAt
    };
}

async function autoAssignZoneIfPrimary(tenantId = DEFAULT_TENANT_ID, address = null) {
    const item = address && typeof address === 'object' ? address : null;
    if (!item || item.isPrimary !== true) return;
    try {
        const zoneRulesService = require('./tenant-zone-rules.service');
        if (typeof zoneRulesService.applyZoneForAddress === 'function') {
            await zoneRulesService.applyZoneForAddress(tenantId, item);
        }
    } catch (error) {
        console.warn('[customers] zone auto assignment skipped:', String(error?.message || error));
    }
}

function mapPostgresRow(row = {}) {
    return normalizeAddress({
        addressId: row.address_id,
        tenantId: row.tenant_id,
        customerId: row.customer_id,
        addressType: row.address_type,
        street: row.street,
        reference: row.reference,
        mapsUrl: row.maps_url,
        wkt: row.wkt,
        latitude: row.latitude,
        longitude: row.longitude,
        isPrimary: row.is_primary,
        districtId: row.district_id,
        districtName: row.district_name,
        provinceName: row.province_name,
        departmentName: row.department_name,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    });
}

function missingRelation(error) {
    return String(error?.code || '').trim() === '42P01';
}

async function ensurePostgresSchema() {
    if (schemaPromise) return schemaPromise;
    schemaPromise = (async () => {
        await queryPostgres(`
            CREATE TABLE IF NOT EXISTS tenant_customer_addresses (
                address_id TEXT NOT NULL,
                tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
                customer_id TEXT NOT NULL,
                address_type TEXT NOT NULL DEFAULT 'other'
                    CHECK (address_type IN ('fiscal', 'delivery', 'other')),
                street TEXT NULL,
                reference TEXT NULL,
                maps_url TEXT NULL,
                wkt TEXT NULL,
                latitude NUMERIC(10, 7) NULL,
                longitude NUMERIC(10, 7) NULL,
                is_primary BOOLEAN NOT NULL DEFAULT FALSE,
                district_id TEXT NULL,
                district_name TEXT NULL,
                province_name TEXT NULL,
                department_name TEXT NULL,
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (address_id),
                FOREIGN KEY (tenant_id, customer_id)
                    REFERENCES tenant_customers(tenant_id, customer_id)
                    ON DELETE CASCADE
            )
        `);

        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_tenant_customer_addresses_customer
            ON tenant_customer_addresses(tenant_id, customer_id, updated_at DESC)
        `);

        await queryPostgres(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_customer_addresses_primary_unique
            ON tenant_customer_addresses(tenant_id, customer_id)
            WHERE is_primary = TRUE
        `);
    })();

    try {
        await schemaPromise;
    } catch (error) {
        schemaPromise = null;
        throw error;
    }
}

async function readStore(tenantId = DEFAULT_TENANT_ID) {
    const parsed = await readTenantJsonFile(STORE_FILE, {
        tenantId,
        defaultValue: { items: [] }
    });
    const items = ensureArray(parsed?.items).map((entry) => normalizeAddress(entry));
    return { items };
}

async function writeStore(tenantId = DEFAULT_TENANT_ID, store = { items: [] }) {
    await writeTenantJsonFile(STORE_FILE, {
        items: ensureArray(store?.items).map((entry) => normalizeAddress(entry))
    }, { tenantId });
}

async function listAddresses(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const cleanTenantId = normalizeTenant(tenantId);
    const customerId = toText(options?.customerId || options?.customer_id || '');
    if (!customerId) return [];

    if (getStorageDriver() === 'postgres') {
        try {
            await ensurePostgresSchema();
            const result = await queryPostgres(
                `SELECT *
                 FROM tenant_customer_addresses
                 WHERE tenant_id = $1
                   AND customer_id = $2
                 ORDER BY is_primary DESC, updated_at DESC`,
                [cleanTenantId, customerId]
            );
            return ensureArray(result?.rows).map(mapPostgresRow).map(enrichAddressGeo).map(normalizeAddress);
        } catch (error) {
            if (!missingRelation(error)) throw error;
        }
    }

    const store = await readStore(cleanTenantId);
    return store.items
        .filter((item) => item.customerId === customerId)
        .map(enrichAddressGeo)
        .map(normalizeAddress)
        .sort((a, b) => {
            if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
            return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
        });
}

async function upsertAddress(tenantId = DEFAULT_TENANT_ID, payload = {}) {
    const cleanTenantId = normalizeTenant(tenantId);
    const addressId = toText(payload?.addressId || payload?.address_id || '');

    if (getStorageDriver() === 'postgres') {
        try {
            await ensurePostgresSchema();
            let previous = null;
            if (addressId) {
                const existingRes = await queryPostgres(
                    `SELECT *
                     FROM tenant_customer_addresses
                     WHERE tenant_id = $1 AND address_id = $2
                     LIMIT 1`,
                    [cleanTenantId, addressId]
                );
                previous = existingRes?.rows?.[0] ? mapPostgresRow(existingRes.rows[0]) : null;
            }

            const normalized = normalizeAddress({
                ...payload,
                tenantId: cleanTenantId,
                addressId: addressId || previous?.addressId || randomAddressId(),
                customerId: payload?.customerId || payload?.customer_id || previous?.customerId || ''
            }, previous);

            if (!normalized.customerId) throw new Error('customerId requerido para direccion.');

            if (normalized.isPrimary) {
                await queryPostgres(
                    `UPDATE tenant_customer_addresses
                        SET is_primary = FALSE, updated_at = NOW()
                      WHERE tenant_id = $1
                        AND customer_id = $2
                        AND address_id <> $3`,
                    [cleanTenantId, normalized.customerId, normalized.addressId]
                );
            }

            const result = await queryPostgres(
                `INSERT INTO tenant_customer_addresses (
                    address_id, tenant_id, customer_id, address_type, street, reference, maps_url, wkt,
                    latitude, longitude, is_primary, district_id, district_name, province_name, department_name,
                    metadata, created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8,
                    $9, $10, $11, $12, $13, $14, $15,
                    $16::jsonb, $17, $18
                )
                ON CONFLICT (address_id)
                DO UPDATE SET
                    customer_id = EXCLUDED.customer_id,
                    address_type = EXCLUDED.address_type,
                    street = EXCLUDED.street,
                    reference = EXCLUDED.reference,
                    maps_url = EXCLUDED.maps_url,
                    wkt = EXCLUDED.wkt,
                    latitude = EXCLUDED.latitude,
                    longitude = EXCLUDED.longitude,
                    is_primary = EXCLUDED.is_primary,
                    district_id = EXCLUDED.district_id,
                    district_name = EXCLUDED.district_name,
                    province_name = EXCLUDED.province_name,
                    department_name = EXCLUDED.department_name,
                    metadata = EXCLUDED.metadata,
                    updated_at = EXCLUDED.updated_at
                RETURNING *`,
                [
                    normalized.addressId,
                    cleanTenantId,
                    normalized.customerId,
                    normalized.addressType,
                    normalized.street,
                    normalized.reference,
                    normalized.mapsUrl,
                    normalized.wkt,
                    normalized.latitude,
                    normalized.longitude,
                    normalized.isPrimary,
                    normalized.districtId,
                    normalized.districtName,
                    normalized.provinceName,
                    normalized.departmentName,
                    JSON.stringify(normalized.metadata || {}),
                    normalized.createdAt,
                    normalized.updatedAt
                ]
            );

            const saved = result?.rows?.[0] ? mapPostgresRow(result.rows[0]) : normalized;
            await autoAssignZoneIfPrimary(cleanTenantId, saved);
            return saved;
        } catch (error) {
            if (!missingRelation(error)) throw error;
        }
    }

    const store = await readStore(cleanTenantId);
    const items = store.items;
    const index = items.findIndex((item) => item.addressId === addressId && item.tenantId === cleanTenantId);
    const previous = index >= 0 ? items[index] : null;
    const normalized = normalizeAddress({
        ...payload,
        tenantId: cleanTenantId,
        addressId: addressId || previous?.addressId || randomAddressId(),
        customerId: payload?.customerId || payload?.customer_id || previous?.customerId || ''
    }, previous);

    if (!normalized.customerId) throw new Error('customerId requerido para direccion.');

    if (normalized.isPrimary) {
        for (let i = 0; i < items.length; i += 1) {
            const item = items[i];
            if (item.customerId === normalized.customerId && item.addressId !== normalized.addressId && item.isPrimary) {
                items[i] = normalizeAddress({ ...item, isPrimary: false, updatedAt: nowIso() }, item);
            }
        }
    }

    if (index >= 0) items[index] = normalized;
    else items.push(normalized);

    await writeStore(cleanTenantId, { items });
    await autoAssignZoneIfPrimary(cleanTenantId, normalized);
    return normalized;
}

async function deleteAddress(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const cleanTenantId = normalizeTenant(tenantId);
    const addressId = toText(options?.addressId || options?.address_id || '');
    if (!addressId) return false;

    if (getStorageDriver() === 'postgres') {
        try {
            await ensurePostgresSchema();
            const result = await queryPostgres(
                `DELETE FROM tenant_customer_addresses
                 WHERE tenant_id = $1 AND address_id = $2`,
                [cleanTenantId, addressId]
            );
            return Number(result?.rowCount || 0) > 0;
        } catch (error) {
            if (!missingRelation(error)) throw error;
        }
    }

    const store = await readStore(cleanTenantId);
    const next = store.items.filter((item) => item.addressId !== addressId);
    const changed = next.length !== store.items.length;
    if (changed) {
        await writeStore(cleanTenantId, { items: next });
    }
    return changed;
}

async function setPrimaryAddress(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const cleanTenantId = normalizeTenant(tenantId);
    const addressId = toText(options?.addressId || options?.address_id || '');
    const customerIdInput = toText(options?.customerId || options?.customer_id || '');
    if (!addressId) throw new Error('addressId requerido.');

    if (getStorageDriver() === 'postgres') {
        try {
            await ensurePostgresSchema();
            const foundRes = await queryPostgres(
                `SELECT *
                 FROM tenant_customer_addresses
                 WHERE tenant_id = $1 AND address_id = $2
                 LIMIT 1`,
                [cleanTenantId, addressId]
            );
            const found = foundRes?.rows?.[0] ? mapPostgresRow(foundRes.rows[0]) : null;
            if (!found) throw new Error('Direccion no encontrada.');
            const customerId = customerIdInput || found.customerId;
            if (!customerId) throw new Error('customerId requerido para direccion primaria.');

            await queryPostgres(
                `UPDATE tenant_customer_addresses
                    SET is_primary = FALSE, updated_at = NOW()
                  WHERE tenant_id = $1
                    AND customer_id = $2`,
                [cleanTenantId, customerId]
            );

            const updateRes = await queryPostgres(
                `UPDATE tenant_customer_addresses
                    SET is_primary = TRUE, updated_at = NOW()
                  WHERE tenant_id = $1
                    AND customer_id = $2
                    AND address_id = $3
                  RETURNING *`,
                [cleanTenantId, customerId, addressId]
            );
            const updated = updateRes?.rows?.[0] ? mapPostgresRow(updateRes.rows[0]) : null;
            if (!updated) throw new Error('Direccion no encontrada para marcar primaria.');
            await autoAssignZoneIfPrimary(cleanTenantId, updated);
            return updated;
        } catch (error) {
            if (!missingRelation(error)) throw error;
        }
    }

    const store = await readStore(cleanTenantId);
    const index = store.items.findIndex((item) => item.addressId === addressId);
    if (index < 0) throw new Error('Direccion no encontrada.');
    const target = store.items[index];
    const customerId = customerIdInput || target.customerId;
    if (!customerId) throw new Error('customerId requerido para direccion primaria.');

    const next = store.items.map((item) => {
        if (item.customerId !== customerId) return item;
        const shouldBePrimary = item.addressId === addressId;
        if (item.isPrimary === shouldBePrimary) return item;
        return normalizeAddress({ ...item, isPrimary: shouldBePrimary, updatedAt: nowIso() }, item);
    });

    await writeStore(cleanTenantId, { items: next });
    const updated = next.find((item) => item.addressId === addressId) || null;
    await autoAssignZoneIfPrimary(cleanTenantId, updated);
    return updated;
}

module.exports = {
    listAddresses,
    upsertAddress,
    deleteAddress,
    setPrimaryAddress
};
