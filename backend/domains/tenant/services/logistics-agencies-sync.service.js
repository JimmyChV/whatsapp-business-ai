const crypto = require('crypto');
const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    queryPostgres,
    readTenantJsonFile,
    writeTenantJsonFile
} = require('../../../config/persistence-runtime');
const tenantCatalogService = require('./tenant-catalog.service');
const { isWooConfigured } = require('./woocommerce.service');

const AGENCIES_FILE = 'tenant_logistics_agencies.json';
const SYNC_TIMEOUT_MS = 5000;
const FALLBACK_CENTER = { lat: -9.19, lng: -75.01 };

function text(value = '') {
    return String(value || '').trim();
}

function lower(value = '') {
    return text(value).toLowerCase();
}

function normalizeTenant(tenantId = DEFAULT_TENANT_ID) {
    return normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
}

function ensureArray(value = []) {
    return Array.isArray(value) ? value : [];
}

function safeObject(value = {}) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeNumberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBool(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    const clean = lower(value);
    if (['true', '1', 'si', 'yes', 'activo', 'enabled'].includes(clean)) return true;
    if (['false', '0', 'no', 'inactivo', 'disabled'].includes(clean)) return false;
    return fallback;
}

function inferCarrier(source = {}) {
    const haystack = lower([
        source.carrier,
        source.transport,
        source.agency,
        source.name,
        source.full_name,
        source.fullName,
        source.code,
        source.slug
    ].filter(Boolean).join(' '));
    if (haystack.includes('shalom')) return 'shalom';
    if (haystack.includes('marvisur')) return 'marvisur';
    return text(source.carrier || source.transport || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '_') || '';
}

function stableExternalId(carrier = '', source = {}) {
    const direct = text(source.external_id || source.externalId || source.id || source.ID || source.code || source.codigo || source.slug || '');
    if (direct) return direct.slice(0, 50);
    const fingerprint = [
        carrier,
        source.name,
        source.full_name || source.fullName,
        source.address || source.direccion,
        source.latitude || source.lat,
        source.longitude || source.lng
    ].map(text).join('|');
    return crypto.createHash('sha1').update(fingerprint).digest('hex').slice(0, 40);
}

function normalizeAgency(source = {}, tenantId = DEFAULT_TENANT_ID) {
    const input = safeObject(source);
    const carrier = inferCarrier(input);
    if (!carrier) return null;
    const externalId = stableExternalId(carrier, input);
    const name = text(input.name || input.nombre || input.full_name || input.fullName || input.title || `${carrier} ${externalId}`);
    if (!externalId || !name) return null;
    return {
        tenantId: normalizeTenant(tenantId),
        carrier,
        externalId,
        code: text(input.code || input.codigo || input.slug || ''),
        name,
        fullName: text(input.full_name || input.fullName || input.nombre_completo || name),
        address: text(input.address || input.direccion || input.location || ''),
        referenceText: text(input.reference_text || input.referenceText || input.reference || input.referencia || ''),
        phonePrimary: text(input.phone_primary || input.phonePrimary || input.phone || input.telefono || ''),
        department: text(input.department || input.departamento || input.state || ''),
        province: text(input.province || input.provincia || ''),
        city: text(input.city || input.ciudad || ''),
        district: text(input.district || input.distrito || input.city || ''),
        ubigeo: text(input.ubigeo || input.ubigeo_code || ''),
        latitude: normalizeNumberOrNull(input.latitude ?? input.lat),
        longitude: normalizeNumberOrNull(input.longitude ?? input.lng ?? input.lon),
        hoursWeek: text(input.hours_week || input.hoursWeek || input.schedule || input.horario || input.horario_semana || ''),
        hoursSunday: text(input.hours_sunday || input.hoursSunday || input.horario_domingo || ''),
        hoursDelivery: text(input.hours_delivery || input.hoursDelivery || input.horario_entrega || ''),
        isMain: normalizeBool(input.is_main ?? input.isMain ?? input.main, false),
        isDeliveryEnabled: normalizeBool(input.is_delivery_enabled ?? input.isDeliveryEnabled ?? input.delivery_enabled, false),
        isActive: input.is_active !== false && input.isActive !== false
    };
}

function normalizeAgencyRow(row = {}) {
    return {
        id: row.id ?? null,
        tenantId: text(row.tenant_id || row.tenantId || ''),
        carrier: lower(row.carrier),
        externalId: text(row.external_id || row.externalId || ''),
        code: text(row.code || ''),
        name: text(row.name || ''),
        fullName: text(row.full_name || row.fullName || ''),
        address: text(row.address || ''),
        referenceText: text(row.reference_text || row.referenceText || ''),
        phonePrimary: text(row.phone_primary || row.phonePrimary || ''),
        department: text(row.department || ''),
        province: text(row.province || ''),
        city: text(row.city || ''),
        district: text(row.district || ''),
        ubigeo: text(row.ubigeo || ''),
        latitude: normalizeNumberOrNull(row.latitude),
        longitude: normalizeNumberOrNull(row.longitude),
        hoursWeek: text(row.hours_week || row.hoursWeek || ''),
        hoursSunday: text(row.hours_sunday || row.hoursSunday || ''),
        hoursDelivery: text(row.hours_delivery || row.hoursDelivery || ''),
        isMain: row.is_main === true || row.isMain === true,
        isDeliveryEnabled: row.is_delivery_enabled === true || row.isDeliveryEnabled === true,
        isActive: row.is_active !== false && row.isActive !== false,
        syncedAt: row.synced_at || row.syncedAt || null,
        distanceKm: normalizeNumberOrNull(row.distance_km || row.distanceKm)
    };
}

async function ensurePostgresSchema() {
    await queryPostgres(`
        CREATE TABLE IF NOT EXISTS tenant_logistics_agencies (
          id BIGSERIAL PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
          carrier VARCHAR(20) NOT NULL,
          external_id VARCHAR(50) NOT NULL,
          code VARCHAR(50),
          name VARCHAR(255) NOT NULL,
          full_name VARCHAR(255),
          address TEXT,
          reference_text TEXT,
          phone_primary VARCHAR(100),
          department VARCHAR(100),
          province VARCHAR(100),
          city VARCHAR(100),
          district VARCHAR(100),
          ubigeo VARCHAR(20),
          latitude DECIMAL(10,7),
          longitude DECIMAL(10,7),
          hours_week TEXT,
          hours_sunday TEXT,
          hours_delivery TEXT,
          is_main BOOLEAN NOT NULL DEFAULT false,
          is_delivery_enabled BOOLEAN NOT NULL DEFAULT false,
          is_active BOOLEAN NOT NULL DEFAULT true,
          synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(tenant_id, carrier, external_id)
        )
    `);
    await queryPostgres(`
        CREATE INDEX IF NOT EXISTS idx_agencies_tenant_carrier
          ON tenant_logistics_agencies(tenant_id, carrier, is_active)
    `);
    await queryPostgres(`
        CREATE INDEX IF NOT EXISTS idx_agencies_coords
          ON tenant_logistics_agencies(latitude, longitude)
          WHERE latitude IS NOT NULL
            AND longitude IS NOT NULL
            AND is_active = true
    `);
    await queryPostgres(`
        CREATE INDEX IF NOT EXISTS idx_agencies_tenant_active
          ON tenant_logistics_agencies(tenant_id, is_active)
    `);
}

async function resolveWooCatalog(tenantId = DEFAULT_TENANT_ID) {
    const cleanTenantId = normalizeTenant(tenantId);
    const catalogs = await tenantCatalogService.listCatalogs(cleanTenantId, {
        includeInactive: false,
        runtime: true
    });
    const wooCatalogs = ensureArray(catalogs)
        .filter((catalog) => lower(catalog?.sourceType) === 'woocommerce');
    return wooCatalogs.find((catalog) => catalog.isDefault === true) || wooCatalogs[0] || null;
}

function buildBaseUrl(catalog = {}) {
    const woo = safeObject(catalog?.config?.woocommerce);
    const baseUrl = text(woo.baseUrl).replace(/\/+$/, '');
    return baseUrl || '';
}

function extractAgencyArray(payload) {
    if (Array.isArray(payload)) return payload;
    const root = safeObject(payload);
    if (Array.isArray(root.agencies)) return root.agencies;
    if (Array.isArray(root.items)) return root.items;
    if (Array.isArray(root.data)) return root.data;
    const data = safeObject(root.data);
    if (Array.isArray(data.agencies)) return data.agencies;
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.results)) return data.results;
    return [];
}

async function fetchJsonWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        const bodyText = await response.text();
        let payload = null;
        try {
            payload = bodyText ? JSON.parse(bodyText) : null;
        } catch (_) {
            payload = bodyText;
        }
        if (!response.ok) {
            const message = typeof payload?.message === 'string'
                ? payload.message
                : `WordPress respondio ${response.status}`;
            throw new Error(message);
        }
        return payload;
    } finally {
        clearTimeout(timer);
    }
}

async function fetchAgenciesFromWordPress(baseUrl = '') {
    const cleanBase = text(baseUrl).replace(/\/+$/, '');
    if (!cleanBase) throw new Error('URL de WordPress no configurada.');
    const ajaxUrl = `${cleanBase}/wp-admin/admin-ajax.php`;
    try {
        const form = new URLSearchParams();
        form.set('action', 'lavitat_get_agencies');
        form.set('limit', '500');
        const payload = await fetchJsonWithTimeout(ajaxUrl, {
            method: 'POST',
            headers: {
                accept: 'application/json',
                'content-type': 'application/x-www-form-urlencoded'
            },
            body: form.toString()
        });
        const agencies = extractAgencyArray(payload);
        if (agencies.length) {
            return { agencies, source: 'wordpress_ajax' };
        }
    } catch (error) {
        console.warn('[Agencies] ajax agency sync failed; trying nearest endpoint', {
            error: String(error?.message || error)
        });
    }

    const nearestUrl = new URL(`${cleanBase}/wp-json/lavitat/v1/nearest-agencies`);
    nearestUrl.searchParams.set('lat', String(FALLBACK_CENTER.lat));
    nearestUrl.searchParams.set('lng', String(FALLBACK_CENTER.lng));
    nearestUrl.searchParams.set('limit', '500');
    const payload = await fetchJsonWithTimeout(nearestUrl.toString(), {
        method: 'GET',
        headers: { accept: 'application/json' }
    });
    return {
        agencies: extractAgencyArray(payload),
        source: 'nearest_fallback_center'
    };
}

async function readStore(tenantId = DEFAULT_TENANT_ID) {
    const cleanTenantId = normalizeTenant(tenantId);
    const parsed = await readTenantJsonFile(AGENCIES_FILE, {
        tenantId: cleanTenantId,
        defaultValue: { items: [] }
    });
    return {
        items: ensureArray(parsed?.items)
            .map((item) => normalizeAgencyRow({ ...item, tenantId: cleanTenantId }))
            .filter((item) => item.carrier && item.externalId && item.name)
    };
}

async function writeStore(tenantId = DEFAULT_TENANT_ID, items = []) {
    const cleanTenantId = normalizeTenant(tenantId);
    await writeTenantJsonFile(AGENCIES_FILE, {
        items: ensureArray(items)
            .map((item) => normalizeAgencyRow({ ...item, tenantId: cleanTenantId }))
            .filter((item) => item.carrier && item.externalId && item.name)
    }, { tenantId: cleanTenantId });
}

async function upsertAgenciesFile(tenantId, agencies = []) {
    const cleanTenantId = normalizeTenant(tenantId);
    const store = await readStore(cleanTenantId);
    const incomingKeys = new Set();
    const byKey = new Map(store.items.map((item) => [`${item.carrier}:${item.externalId}`, item]));
    const now = new Date().toISOString();
    agencies.forEach((agency) => {
        const key = `${agency.carrier}:${agency.externalId}`;
        incomingKeys.add(key);
        byKey.set(key, {
            ...(byKey.get(key) || {}),
            ...agency,
            tenantId: cleanTenantId,
            isActive: true,
            syncedAt: now
        });
    });
    const next = Array.from(byKey.values()).map((item) => ({
        ...item,
        isActive: incomingKeys.has(`${item.carrier}:${item.externalId}`) ? true : false
    }));
    await writeStore(cleanTenantId, next);
    return agencies.length;
}

async function upsertAgenciesPostgres(tenantId, agencies = []) {
    const cleanTenantId = normalizeTenant(tenantId);
    await ensurePostgresSchema();
    const incomingKeys = [];
    for (const agency of agencies) {
        incomingKeys.push(`${agency.carrier}:${agency.externalId}`);
        await queryPostgres(
            `INSERT INTO tenant_logistics_agencies (
                tenant_id, carrier, external_id, code, name, full_name, address, reference_text,
                phone_primary, department, province, city, district, ubigeo, latitude, longitude,
                hours_week, hours_sunday, hours_delivery, is_main, is_delivery_enabled, is_active,
                synced_at, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8,
                $9, $10, $11, $12, $13, $14, $15, $16,
                $17, $18, $19, $20, $21, TRUE,
                NOW(), NOW(), NOW()
            )
            ON CONFLICT (tenant_id, carrier, external_id)
            DO UPDATE SET
                code = EXCLUDED.code,
                name = EXCLUDED.name,
                full_name = EXCLUDED.full_name,
                address = EXCLUDED.address,
                reference_text = EXCLUDED.reference_text,
                phone_primary = EXCLUDED.phone_primary,
                department = EXCLUDED.department,
                province = EXCLUDED.province,
                city = EXCLUDED.city,
                district = EXCLUDED.district,
                ubigeo = EXCLUDED.ubigeo,
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude,
                hours_week = EXCLUDED.hours_week,
                hours_sunday = EXCLUDED.hours_sunday,
                hours_delivery = EXCLUDED.hours_delivery,
                is_main = EXCLUDED.is_main,
                is_delivery_enabled = EXCLUDED.is_delivery_enabled,
                is_active = TRUE,
                synced_at = NOW(),
                updated_at = NOW()`,
            [
                cleanTenantId,
                agency.carrier,
                agency.externalId,
                agency.code || null,
                agency.name,
                agency.fullName || null,
                agency.address || null,
                agency.referenceText || null,
                agency.phonePrimary || null,
                agency.department || null,
                agency.province || null,
                agency.city || null,
                agency.district || null,
                agency.ubigeo || null,
                agency.latitude,
                agency.longitude,
                agency.hoursWeek || null,
                agency.hoursSunday || null,
                agency.hoursDelivery || null,
                agency.isMain === true,
                agency.isDeliveryEnabled === true
            ]
        );
    }

    if (incomingKeys.length) {
        await queryPostgres(
            `UPDATE tenant_logistics_agencies
                SET is_active = FALSE,
                    updated_at = NOW()
              WHERE tenant_id = $1
                AND NOT ((carrier || ':' || external_id) = ANY($2::text[]))`,
            [cleanTenantId, incomingKeys]
        );
    }
    return agencies.length;
}

async function syncAgenciesFromWordPress(tenantId = DEFAULT_TENANT_ID) {
    const cleanTenantId = normalizeTenant(tenantId);
    const catalog = await resolveWooCatalog(cleanTenantId);
    if (!catalog) throw new Error('No hay catalogos WooCommerce activos para sincronizar agencias.');
    const wooConfig = safeObject(catalog?.config?.woocommerce);
    if (!isWooConfigured(wooConfig)) throw new Error('Credenciales WooCommerce incompletas para sincronizar agencias.');
    const baseUrl = buildBaseUrl(catalog);
    const { agencies: rawAgencies, source } = await fetchAgenciesFromWordPress(baseUrl);
    const agencies = ensureArray(rawAgencies)
        .map((item) => normalizeAgency(item, cleanTenantId))
        .filter(Boolean);

    const synced = getStorageDriver() === 'postgres'
        ? await upsertAgenciesPostgres(cleanTenantId, agencies)
        : await upsertAgenciesFile(cleanTenantId, agencies);

    console.log(`[Agencies] synced ${synced} agencies for tenant`, {
        tenantId: cleanTenantId,
        source
    });
    return {
        synced,
        source,
        agencies
    };
}

function haversineKm(lat1, lng1, lat2, lng2) {
    const toRad = (value) => (Number(value) * Math.PI) / 180;
    const earthKm = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function findNearestAgencies(tenantId = DEFAULT_TENANT_ID, lat, lng, limit = 6, carriers = null) {
    const cleanTenantId = normalizeTenant(tenantId);
    const cleanLat = Number(lat);
    const cleanLng = Number(lng);
    const cleanLimit = Math.min(50, Math.max(1, Number(limit || 6) || 6));
    const cleanCarriers = Array.isArray(carriers)
        ? carriers.map(lower).filter(Boolean)
        : null;
    if (!Number.isFinite(cleanLat) || !Number.isFinite(cleanLng)) return [];

    if (getStorageDriver() !== 'postgres') {
        const store = await readStore(cleanTenantId);
        return store.items
            .filter((item) => item.isActive !== false)
            .filter((item) => item.latitude !== null && item.longitude !== null)
            .filter((item) => !cleanCarriers?.length || cleanCarriers.includes(item.carrier))
            .map((item) => ({
                ...item,
                distanceKm: Math.round(haversineKm(cleanLat, cleanLng, item.latitude, item.longitude) * 100) / 100
            }))
            .sort((left, right) => left.distanceKm - right.distanceKm)
            .slice(0, cleanLimit);
    }

    await ensurePostgresSchema();
    const { rows } = await queryPostgres(
        `SELECT
            id, carrier, external_id, code, name, full_name, address,
            reference_text, phone_primary, department, province, city, district,
            ubigeo, latitude, longitude, hours_week, hours_sunday, hours_delivery,
            is_main, is_delivery_enabled, is_active,
            (
              6371 * ACOS(
                LEAST(1, GREATEST(-1,
                  COS(RADIANS($2)) * COS(RADIANS(latitude)) *
                  COS(RADIANS(longitude) - RADIANS($3)) +
                  SIN(RADIANS($2)) * SIN(RADIANS(latitude))
                ))
              )
            ) AS distance_km
           FROM tenant_logistics_agencies
          WHERE tenant_id = $1
            AND is_active = TRUE
            AND latitude IS NOT NULL
            AND longitude IS NOT NULL
            AND ($4::text[] IS NULL OR carrier = ANY($4::text[]))
          ORDER BY distance_km ASC
          LIMIT $5`,
        [cleanTenantId, cleanLat, cleanLng, cleanCarriers?.length ? cleanCarriers : null, cleanLimit]
    );
    return ensureArray(rows).map(normalizeAgencyRow);
}

async function syncAgenciesBestEffort(tenantId = DEFAULT_TENANT_ID) {
    try {
        return await syncAgenciesFromWordPress(tenantId);
    } catch (error) {
        console.warn('[Agencies] sync skipped:', {
            tenantId,
            error: String(error?.message || error)
        });
        return {
            synced: 0,
            error: String(error?.message || error)
        };
    }
}

module.exports = {
    syncAgenciesFromWordPress,
    syncAgenciesBestEffort,
    findNearestAgencies
};
