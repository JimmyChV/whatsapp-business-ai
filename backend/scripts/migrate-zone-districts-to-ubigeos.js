#!/usr/bin/env node
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
require('dotenv').config({ quiet: true });

process.env.PGHOST = process.env.PGHOST || '127.0.0.1';
process.env.PGPORT = process.env.PGPORT || '5433';
process.env.PGDATABASE = process.env.PGDATABASE || 'wa_saas_prod';

const { queryPostgres, getPostgresPool } = require('../config/persistence-runtime');

const DEFAULT_TENANT_ID = 'tenant_cleaning';

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

function ensureArray(value = []) {
    return Array.isArray(value) ? value : [];
}

function uniq(items = []) {
    return Array.from(new Set(ensureArray(items).map(text).filter(Boolean)));
}

function normalizeSegmentKey(value = '') {
    return text(value).toLowerCase();
}

function collectRuleValues(rulesJson = {}, keys = []) {
    const output = [];
    const visit = (value) => {
        if (!value) return;
        if (Array.isArray(value)) {
            value.forEach(visit);
            return;
        }
        if (typeof value !== 'object') return;
        keys.forEach((key) => {
            const entry = value[key];
            if (Array.isArray(entry)) entry.forEach((item) => output.push(item));
        });
        Object.values(value).forEach(visit);
    };
    visit(rulesJson && typeof rulesJson === 'object' ? rulesJson : {});
    return uniq(output.map((entry) => {
        if (entry && typeof entry === 'object') return entry.name || entry.label || entry.value || entry.id || '';
        return entry;
    }));
}

function scoreMatchForSegment(match = {}, segmentKey = '') {
    const segment = normalizeSegmentKey(segmentKey);
    const province = normalizeName(match.province_name || '');
    const department = normalizeName(match.department_name || '');
    if (segment === 'lima_delivery' || segment === 'lima_marvisur') {
        if (province === 'lima' || department === 'lima') return 100;
        if (department === 'callao' || province === 'callao') return 95;
    }
    if (segment === 'trujillo_delivery' || segment === 'trujillo_costo') {
        if (department === 'la libertad') return 100;
        if (province === 'trujillo') return 95;
    }
    if (segment === 'resto_marvisur') {
        return 50;
    }
    return 0;
}

function pickBestMatch(matches = [], segmentKey = '') {
    const candidates = ensureArray(matches);
    if (candidates.length <= 1) return candidates[0] || null;
    return [...candidates].sort((left, right) => {
        const segmentDelta = scoreMatchForSegment(right, segmentKey) - scoreMatchForSegment(left, segmentKey);
        if (segmentDelta !== 0) return segmentDelta;
        return text(left.id).localeCompare(text(right.id), 'es');
    })[0] || null;
}

async function findDistrictMatches(name = '') {
    const normalized = normalizeName(name);
    if (!normalized) return [];
    const { rows } = await queryPostgres(
        `SELECT
            g.id,
            g.name,
            g.normalized_name,
            g.parent_id,
            p.name AS province_name,
            p.normalized_name AS province_normalized_name,
            d.name AS department_name,
            d.normalized_name AS department_normalized_name
           FROM geo_locations g
           JOIN geo_locations p ON p.id = g.parent_id
           JOIN geo_locations d ON d.id = p.parent_id
          WHERE g.normalized_name = $1
            AND g.type = 'district'
            AND COALESCE(g.is_active, TRUE) = TRUE
          ORDER BY d.normalized_name ASC, p.normalized_name ASC, g.id ASC`,
        [normalized]
    );
    return rows || [];
}

async function findSimpleMatches(name = '', type = 'province') {
    const normalized = normalizeName(name);
    if (!normalized) return [];
    const { rows } = await queryPostgres(
        `SELECT
            g.id,
            g.name,
            g.normalized_name,
            g.parent_id,
            p.name AS department_name,
            p.normalized_name AS department_normalized_name
           FROM geo_locations g
           LEFT JOIN geo_locations p ON p.id = g.parent_id
          WHERE g.normalized_name = $1
            AND g.type = $2
            AND COALESCE(g.is_active, TRUE) = TRUE
          ORDER BY COALESCE(p.normalized_name, '') ASC, g.id ASC`,
        [normalized, type]
    );
    return rows || [];
}

async function migrateTenantZones(tenantId = DEFAULT_TENANT_ID) {
    const { rows: zones } = await queryPostgres(
        `SELECT rule_id, name, rules_json, ubigeo_codes, segment_key
           FROM tenant_zone_rules
          WHERE tenant_id = $1
          ORDER BY name ASC`,
        [tenantId]
    );

    const totals = {
        zones: zones.length,
        districts: { found: 0, total: 0 },
        provinces: { found: 0, total: 0 },
        departments: { found: 0, total: 0 },
        missing: []
    };

    for (const zone of zones) {
        const rulesJson = zone.rules_json && typeof zone.rules_json === 'object' ? zone.rules_json : {};
        const currentIds = uniq(zone.ubigeo_codes || []);
        const ids = new Set(currentIds);
        const missing = [];
        const zoneStats = {
            districts: { found: 0, total: 0 },
            provinces: { found: 0, total: 0 },
            departments: { found: 0, total: 0 }
        };

        const districts = collectRuleValues(rulesJson, ['districts', 'districtNames', 'distritos', 'district']);
        const provinces = collectRuleValues(rulesJson, ['provinces', 'provinceNames', 'provincias', 'province']);
        const departments = collectRuleValues(rulesJson, ['departments', 'departmentNames', 'departamentos', 'department']);

        for (const district of districts) {
            zoneStats.districts.total += 1;
            totals.districts.total += 1;
            const match = pickBestMatch(await findDistrictMatches(district), zone.segment_key);
            if (match?.id) {
                ids.add(match.id);
                zoneStats.districts.found += 1;
                totals.districts.found += 1;
            } else {
                missing.push(district);
                totals.missing.push(`${zone.name}: ${district}`);
            }
        }

        for (const province of provinces) {
            zoneStats.provinces.total += 1;
            totals.provinces.total += 1;
            const match = pickBestMatch(await findSimpleMatches(province, 'province'), zone.segment_key);
            if (match?.id) {
                ids.add(match.id);
                zoneStats.provinces.found += 1;
                totals.provinces.found += 1;
            } else {
                missing.push(province);
                totals.missing.push(`${zone.name}: ${province}`);
            }
        }

        for (const department of departments) {
            zoneStats.departments.total += 1;
            totals.departments.total += 1;
            const match = pickBestMatch(await findSimpleMatches(department, 'department'), zone.segment_key);
            if (match?.id) {
                ids.add(match.id);
                zoneStats.departments.found += 1;
                totals.departments.found += 1;
            } else {
                missing.push(department);
                totals.missing.push(`${zone.name}: ${department}`);
            }
        }

        const nextIds = Array.from(ids);
        await queryPostgres(
            `UPDATE tenant_zone_rules
                SET ubigeo_codes = $3::jsonb,
                    updated_at = NOW()
              WHERE tenant_id = $1
                AND rule_id = $2`,
            [tenantId, zone.rule_id, JSON.stringify(nextIds)]
        );

        console.log(`[MigrateUbigeos] ${zone.name}: districts: ${zoneStats.districts.found}/${zoneStats.districts.total} found; provinces: ${zoneStats.provinces.found}/${zoneStats.provinces.total} found; departments: ${zoneStats.departments.found}/${zoneStats.departments.total} found; not found: ${missing.length ? missing.join(', ') : '[]'}`);
    }

    console.log('[MigrateUbigeos] summary', {
        tenantId,
        zones: totals.zones,
        districts: `${totals.districts.found}/${totals.districts.total}`,
        provinces: `${totals.provinces.found}/${totals.provinces.total}`,
        departments: `${totals.departments.found}/${totals.departments.total}`,
        missing: totals.missing
    });
}

async function main() {
    const tenantArg = process.argv.find((arg) => arg.startsWith('--tenant='));
    const tenantId = text(tenantArg ? tenantArg.slice('--tenant='.length) : '') || DEFAULT_TENANT_ID;
    await migrateTenantZones(tenantId);
    await getPostgresPool().end();
}

main().catch(async (error) => {
    console.error('[MigrateUbigeos] failed:', error);
    try {
        await getPostgresPool().end();
    } catch (_) {
    }
    process.exit(1);
});
