const {
    DEFAULT_TENANT_ID,
    normalizeTenantId,
    queryPostgres
} = require('../../../config/persistence-runtime');
const {
    resolveSecretPlain
} = require('../helpers/integrations-normalizers.helpers');

const GRAPH_API_VERSION = 'v19.0';
const DAILY_SYNC_HOUR = 6;

let schemaPromise = null;
let scheduleTimeout = null;
let scheduleInterval = null;
let runInFlight = null;

function toText(value = '') {
    return String(value || '').trim();
}

function toNullableText(value = '') {
    const text = toText(value);
    return text || null;
}

function toNumber(value, fallback = 0, { decimals = null } = {}) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    if (!Number.isFinite(decimals)) return parsed;
    const multiplier = 10 ** Math.max(0, Number(decimals) || 0);
    return Math.round(parsed * multiplier) / multiplier;
}

function toInteger(value, fallback = 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.trunc(parsed);
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonSafely(value, fallback = null) {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(String(value));
    } catch (_) {
        return fallback;
    }
}

function normalizeDateInput(value, fallback = null) {
    const text = toText(value);
    if (!text) return fallback;
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return fallback;
    return parsed.toISOString().slice(0, 10);
}

function buildTimeRange(dateStart, dateStop) {
    return JSON.stringify({ since: dateStart, until: dateStop });
}

function aggregateActions(rows = []) {
    const totals = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
        const actions = Array.isArray(row?.actions) ? row.actions : [];
        actions.forEach((action) => {
            const actionType = toText(action?.action_type || action?.actionType);
            if (!actionType) return;
            const current = totals.get(actionType) || 0;
            totals.set(actionType, current + toNumber(action?.value, 0, { decimals: 4 }));
        });
    });
    return Array.from(totals.entries()).map(([action_type, value]) => ({
        action_type,
        value: String(Math.round(value * 10000) / 10000)
    }));
}

function sumRows(rows = []) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const spend = safeRows.reduce((acc, row) => acc + toNumber(row?.spend, 0, { decimals: 2 }), 0);
    const impressions = safeRows.reduce((acc, row) => acc + toInteger(row?.impressions, 0), 0);
    const reach = safeRows.reduce((acc, row) => acc + toInteger(row?.reach, 0), 0);
    const clicks = safeRows.reduce((acc, row) => acc + toInteger(row?.clicks, 0), 0);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;
    const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
    const cpp = reach > 0 ? spend / reach : 0;
    const frequency = reach > 0 ? impressions / reach : 0;
    return {
        spend: toNumber(spend, 0, { decimals: 2 }),
        impressions,
        reach,
        clicks,
        ctr: toNumber(ctr, 0, { decimals: 4 }),
        cpc: toNumber(cpc, 0, { decimals: 4 }),
        cpm: toNumber(cpm, 0, { decimals: 4 }),
        cpp: toNumber(cpp, 0, { decimals: 4 }),
        frequency: toNumber(frequency, 0, { decimals: 4 }),
        actions: aggregateActions(safeRows)
    };
}

function getMessagingConversations(actions = []) {
    const safeActions = Array.isArray(actions) ? actions : [];
    const match = safeActions.find((entry) => toText(entry?.action_type || entry?.actionType) === 'onsite_conversion.total_messaging_connection');
    return Math.max(0, toNumber(match?.value, 0, { decimals: 4 }));
}

async function ensurePostgresSchema() {
    if (schemaPromise) return schemaPromise;
    schemaPromise = (async () => {
        await queryPostgres(`
            CREATE TABLE IF NOT EXISTS tenant_meta_ads_structure (
              id SERIAL PRIMARY KEY,
              tenant_id TEXT NOT NULL,
              object_type TEXT NOT NULL,
              object_id TEXT NOT NULL,
              object_name TEXT,
              parent_id TEXT,
              status TEXT,
              synced_at TIMESTAMPTZ DEFAULT NOW(),
              UNIQUE(tenant_id, object_id)
            )
        `);
        await queryPostgres(`
            CREATE TABLE IF NOT EXISTS tenant_meta_ads_insights (
              id SERIAL PRIMARY KEY,
              tenant_id TEXT NOT NULL,
              object_id TEXT NOT NULL,
              object_type TEXT NOT NULL,
              date_start DATE NOT NULL,
              date_stop DATE NOT NULL,
              spend NUMERIC(12,2),
              impressions INTEGER,
              reach INTEGER,
              clicks INTEGER,
              ctr NUMERIC(8,4),
              cpc NUMERIC(10,4),
              cpm NUMERIC(10,4),
              cpp NUMERIC(10,4),
              frequency NUMERIC(8,4),
              actions JSONB,
              synced_at TIMESTAMPTZ DEFAULT NOW(),
              UNIQUE(tenant_id, object_id, date_start, date_stop)
            )
        `);
        await queryPostgres(`CREATE INDEX IF NOT EXISTS idx_tenant_meta_ads_structure_tenant_type ON tenant_meta_ads_structure(tenant_id, object_type)`);
        await queryPostgres(`CREATE INDEX IF NOT EXISTS idx_tenant_meta_ads_insights_tenant_type_dates ON tenant_meta_ads_insights(tenant_id, object_type, date_start, date_stop)`);
    })().catch((error) => {
        schemaPromise = null;
        throw error;
    });
    return schemaPromise;
}

async function getMetaAdsConfig(tenantId = DEFAULT_TENANT_ID) {
    await ensurePostgresSchema();
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const { rows } = await queryPostgres(
        `SELECT config_json
           FROM tenant_integrations
          WHERE tenant_id = $1
          LIMIT 1`,
        [cleanTenantId]
    );
    const row = rows?.[0] || null;
    const configJson = isPlainObject(row?.config_json) ? row.config_json : {};
    const metaAds = isPlainObject(configJson?.metaAds) ? configJson.metaAds : {};
    const accessToken = resolveSecretPlain(metaAds?.accessToken) || toNullableText(metaAds?.accessToken);
    const adAccountId = toNullableText(metaAds?.adAccountId);
    const businessId = toNullableText(metaAds?.businessId);
    if (!accessToken || !adAccountId) {
        throw new Error('Meta Ads no configurado para este tenant.');
    }
    return {
        tenantId: cleanTenantId,
        businessId,
        adAccountId,
        accessToken
    };
}

async function fetchMetaAdsPages({ path, params = {}, accessToken }) {
    const collected = [];
    let nextUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${path}?${new URLSearchParams({
        ...params,
        access_token: accessToken
    }).toString()}`;

    while (nextUrl) {
        const response = await fetch(nextUrl, { method: 'GET' });
        if (!response.ok) {
            const detail = await response.text();
            throw new Error(`Meta Ads request failed (${response.status}): ${detail}`);
        }
        const payload = await response.json();
        const rows = Array.isArray(payload?.data) ? payload.data : [];
        collected.push(...rows);
        nextUrl = toNullableText(payload?.paging?.next);
    }

    return collected;
}

async function upsertStructureRow(tenantId, row = {}) {
    await queryPostgres(
        `INSERT INTO tenant_meta_ads_structure (
            tenant_id, object_type, object_id, object_name, parent_id, status, synced_at
         ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (tenant_id, object_id)
         DO UPDATE SET
            object_type = EXCLUDED.object_type,
            object_name = EXCLUDED.object_name,
            parent_id = EXCLUDED.parent_id,
            status = EXCLUDED.status,
            synced_at = NOW()`,
        [
            tenantId,
            row.object_type,
            row.object_id,
            row.object_name,
            row.parent_id,
            row.status
        ]
    );
}

async function upsertInsightRow(tenantId, row = {}) {
    await queryPostgres(
        `INSERT INTO tenant_meta_ads_insights (
            tenant_id, object_id, object_type, date_start, date_stop, spend, impressions, reach, clicks, ctr, cpc, cpm, cpp, frequency, actions, synced_at
         ) VALUES (
            $1, $2, $3, $4::date, $5::date, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, NOW()
         )
         ON CONFLICT (tenant_id, object_id, date_start, date_stop)
         DO UPDATE SET
            object_type = EXCLUDED.object_type,
            spend = EXCLUDED.spend,
            impressions = EXCLUDED.impressions,
            reach = EXCLUDED.reach,
            clicks = EXCLUDED.clicks,
            ctr = EXCLUDED.ctr,
            cpc = EXCLUDED.cpc,
            cpm = EXCLUDED.cpm,
            cpp = EXCLUDED.cpp,
            frequency = EXCLUDED.frequency,
            actions = EXCLUDED.actions,
            synced_at = NOW()`,
        [
            tenantId,
            row.object_id,
            row.object_type,
            row.date_start,
            row.date_stop,
            row.spend,
            row.impressions,
            row.reach,
            row.clicks,
            row.ctr,
            row.cpc,
            row.cpm,
            row.cpp,
            row.frequency,
            JSON.stringify(Array.isArray(row.actions) ? row.actions : [])
        ]
    );
}

async function syncMetaAdsStructure(tenantId = DEFAULT_TENANT_ID) {
    const config = await getMetaAdsConfig(tenantId);
    const effectiveStatus = JSON.stringify(['ACTIVE', 'PAUSED', 'ARCHIVED']);

    const [campaigns, adsets, ads] = await Promise.all([
        fetchMetaAdsPages({
            path: `${config.adAccountId}/campaigns`,
            params: { fields: 'id,name,status,objective', effective_status: effectiveStatus, limit: '100' },
            accessToken: config.accessToken
        }),
        fetchMetaAdsPages({
            path: `${config.adAccountId}/adsets`,
            params: { fields: 'id,name,status,campaign_id', effective_status: effectiveStatus, limit: '100' },
            accessToken: config.accessToken
        }),
        fetchMetaAdsPages({
            path: `${config.adAccountId}/ads`,
            params: { fields: 'id,name,status,adset_id,campaign_id', effective_status: effectiveStatus, limit: '100' },
            accessToken: config.accessToken
        })
    ]);

    for (const campaign of campaigns) {
        await upsertStructureRow(config.tenantId, {
            object_type: 'campaign',
            object_id: toText(campaign?.id),
            object_name: toNullableText(campaign?.name),
            parent_id: null,
            status: toNullableText(campaign?.status)
        });
    }
    for (const adset of adsets) {
        await upsertStructureRow(config.tenantId, {
            object_type: 'adset',
            object_id: toText(adset?.id),
            object_name: toNullableText(adset?.name),
            parent_id: toNullableText(adset?.campaign_id),
            status: toNullableText(adset?.status)
        });
    }
    for (const ad of ads) {
        await upsertStructureRow(config.tenantId, {
            object_type: 'ad',
            object_id: toText(ad?.id),
            object_name: toNullableText(ad?.name),
            parent_id: toNullableText(ad?.adset_id),
            status: toNullableText(ad?.status)
        });
    }

    return {
        campaignsCount: campaigns.length,
        adsetsCount: adsets.length,
        adsCount: ads.length,
        totalCount: campaigns.length + adsets.length + ads.length
    };
}

async function syncMetaAdsInsights(tenantId = DEFAULT_TENANT_ID, dateStart, dateStop) {
    const config = await getMetaAdsConfig(tenantId);
    const normalizedDateStart = normalizeDateInput(dateStart);
    const normalizedDateStop = normalizeDateInput(dateStop, normalizedDateStart);
    if (!normalizedDateStart || !normalizedDateStop) {
        throw new Error('Rango de fechas invalido para Meta Ads.');
    }

    const insightRows = await fetchMetaAdsPages({
        path: `${config.adAccountId}/insights`,
        params: {
            fields: 'ad_id,adset_id,campaign_id,date_start,date_stop,spend,impressions,reach,clicks,ctr,cpc,cpm,cpp,frequency,actions',
            level: 'ad',
            time_range: buildTimeRange(normalizedDateStart, normalizedDateStop),
            time_increment: '1',
            limit: '100'
        },
        accessToken: config.accessToken
    });

    const adRows = insightRows.map((row) => ({
        object_id: toText(row?.ad_id),
        object_type: 'ad',
        date_start: normalizeDateInput(row?.date_start, normalizedDateStart),
        date_stop: normalizeDateInput(row?.date_stop, normalizedDateStop),
        spend: toNumber(row?.spend, 0, { decimals: 2 }),
        impressions: toInteger(row?.impressions, 0),
        reach: toInteger(row?.reach, 0),
        clicks: toInteger(row?.clicks, 0),
        ctr: toNumber(row?.ctr, 0, { decimals: 4 }),
        cpc: toNumber(row?.cpc, 0, { decimals: 4 }),
        cpm: toNumber(row?.cpm, 0, { decimals: 4 }),
        cpp: toNumber(row?.cpp, 0, { decimals: 4 }),
        frequency: toNumber(row?.frequency, 0, { decimals: 4 }),
        actions: Array.isArray(row?.actions) ? row.actions : [],
        adset_id: toNullableText(row?.adset_id),
        campaign_id: toNullableText(row?.campaign_id)
    })).filter((row) => row.object_id && row.date_start && row.date_stop);

    const groupBy = (rows, keyName, objectType) => {
        const groups = new Map();
        rows.forEach((row) => {
            const groupId = toNullableText(row?.[keyName]);
            if (!groupId) return;
            const key = `${groupId}:${row.date_start}:${row.date_stop}`;
            const bucket = groups.get(key) || [];
            bucket.push(row);
            groups.set(key, bucket);
        });
        return Array.from(groups.entries()).map(([key, rowsForKey]) => {
            const [objectId, rowDateStart, rowDateStop] = key.split(':');
            const totals = sumRows(rowsForKey);
            return {
                object_id: objectId,
                object_type: objectType,
                date_start: rowDateStart,
                date_stop: rowDateStop,
                ...totals
            };
        });
    };

    const adsetRows = groupBy(adRows, 'adset_id', 'adset');
    const campaignRows = groupBy(adRows, 'campaign_id', 'campaign');
    const allRows = [...adRows, ...adsetRows, ...campaignRows];

    for (const row of allRows) {
        await upsertInsightRow(config.tenantId, row);
    }

    return {
        dateStart: normalizedDateStart,
        dateStop: normalizedDateStop,
        adRowsCount: adRows.length,
        adsetRowsCount: adsetRows.length,
        campaignRowsCount: campaignRows.length,
        insightsCount: allRows.length
    };
}

async function listMetaAdsInsights(tenantId = DEFAULT_TENANT_ID, { dateStart, dateStop } = {}) {
    await ensurePostgresSchema();
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const normalizedDateStart = normalizeDateInput(dateStart);
    const normalizedDateStop = normalizeDateInput(dateStop, normalizedDateStart);
    if (!normalizedDateStart || !normalizedDateStop) {
        throw new Error('Rango de fechas invalido para Meta Ads.');
    }

    const { rows } = await queryPostgres(
        `SELECT
            i.object_id AS ad_id,
            i.date_start,
            i.date_stop,
            i.spend,
            i.impressions,
            i.reach,
            i.clicks,
            i.ctr,
            i.cpc,
            i.cpm,
            i.cpp,
            i.frequency,
            i.actions,
            ad.object_name AS ad_name,
            ad.status AS ad_status,
            adset.object_id AS adset_id,
            adset.object_name AS adset_name,
            adset.status AS adset_status,
            campaign.object_id AS campaign_id,
            campaign.object_name AS campaign_name,
            campaign.status AS campaign_status
         FROM tenant_meta_ads_insights i
         LEFT JOIN tenant_meta_ads_structure ad
           ON ad.tenant_id = i.tenant_id
          AND ad.object_id = i.object_id
          AND ad.object_type = 'ad'
         LEFT JOIN tenant_meta_ads_structure adset
           ON adset.tenant_id = i.tenant_id
          AND adset.object_id = ad.parent_id
          AND adset.object_type = 'adset'
         LEFT JOIN tenant_meta_ads_structure campaign
           ON campaign.tenant_id = i.tenant_id
          AND campaign.object_id = adset.parent_id
          AND campaign.object_type = 'campaign'
         WHERE i.tenant_id = $1
           AND i.object_type = 'ad'
           AND i.date_start >= $2::date
           AND i.date_stop <= $3::date
         ORDER BY i.date_start DESC, campaign.object_name NULLS LAST, adset.object_name NULLS LAST, ad.object_name NULLS LAST`,
        [cleanTenantId, normalizedDateStart, normalizedDateStop]
    );

    return (Array.isArray(rows) ? rows : []).map((row) => {
        const actions = Array.isArray(row?.actions) ? row.actions : parseJsonSafely(row?.actions, []);
        const messagingConversations = getMessagingConversations(actions);
        const spend = toNumber(row?.spend, 0, { decimals: 2 });
        return {
            campaign_id: toNullableText(row?.campaign_id),
            campaign_name: toNullableText(row?.campaign_name),
            campaign_status: toNullableText(row?.campaign_status),
            adset_id: toNullableText(row?.adset_id),
            adset_name: toNullableText(row?.adset_name),
            adset_status: toNullableText(row?.adset_status),
            ad_id: toNullableText(row?.ad_id),
            ad_name: toNullableText(row?.ad_name),
            ad_status: toNullableText(row?.ad_status),
            spend,
            impressions: toInteger(row?.impressions, 0),
            reach: toInteger(row?.reach, 0),
            clicks: toInteger(row?.clicks, 0),
            ctr: toNumber(row?.ctr, 0, { decimals: 4 }),
            cpc: toNumber(row?.cpc, 0, { decimals: 4 }),
            cpm: toNumber(row?.cpm, 0, { decimals: 4 }),
            frequency: toNumber(row?.frequency, 0, { decimals: 4 }),
            messaging_conversations: messagingConversations,
            cost_per_conversation: messagingConversations > 0 ? toNumber(spend / messagingConversations, 0, { decimals: 4 }) : 0,
            date_start: normalizeDateInput(row?.date_start),
            date_stop: normalizeDateInput(row?.date_stop)
        };
    });
}

async function runMetaAdsDailySyncOnce() {
    if (runInFlight) return runInFlight;
    runInFlight = (async () => {
        await ensurePostgresSchema();
        const { rows } = await queryPostgres(
            `SELECT tenant_id
               FROM tenant_integrations
              WHERE COALESCE(config_json->'metaAds'->>'adAccountId', '') <> ''
                AND COALESCE(config_json->'metaAds'->>'accessToken', '') <> ''`
        );
        const tenants = Array.from(new Set((Array.isArray(rows) ? rows : []).map((row) => normalizeTenantId(row?.tenant_id)).filter(Boolean)));
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const dateLabel = yesterday.toISOString().slice(0, 10);
        const results = [];

        for (const tenantId of tenants) {
            try {
                const structure = await syncMetaAdsStructure(tenantId);
                const insights = await syncMetaAdsInsights(tenantId, dateLabel, dateLabel);
                results.push({ tenantId, ok: true, structure, insights });
            } catch (error) {
                results.push({ tenantId, ok: false, error: String(error?.message || error) });
            }
        }

        return {
            ok: true,
            tenants: results,
            dateStart: dateLabel,
            dateStop: dateLabel
        };
    })();

    try {
        return await runInFlight;
    } finally {
        runInFlight = null;
    }
}

function scheduleNextDailyRun() {
    if (scheduleTimeout) clearTimeout(scheduleTimeout);
    if (scheduleInterval) clearInterval(scheduleInterval);

    const now = new Date();
    const firstRun = new Date(now);
    firstRun.setHours(DAILY_SYNC_HOUR, 0, 0, 0);
    if (firstRun.getTime() <= now.getTime()) {
        firstRun.setDate(firstRun.getDate() + 1);
    }
    const delayMs = Math.max(1000, firstRun.getTime() - now.getTime());

    scheduleTimeout = setTimeout(() => {
        runMetaAdsDailySyncOnce().catch(() => { });
        scheduleInterval = setInterval(() => {
            runMetaAdsDailySyncOnce().catch(() => { });
        }, 24 * 60 * 60 * 1000);
        if (typeof scheduleInterval?.unref === 'function') scheduleInterval.unref();
    }, delayMs);
    if (typeof scheduleTimeout?.unref === 'function') scheduleTimeout.unref();

    return {
        nextRunAt: firstRun.toISOString(),
        intervalHours: 24
    };
}

async function startDailySync() {
    await ensurePostgresSchema();
    return scheduleNextDailyRun();
}

module.exports = {
    ensurePostgresSchema,
    syncMetaAdsStructure,
    syncMetaAdsInsights,
    listMetaAdsInsights,
    runMetaAdsDailySyncOnce,
    startDailySync
};
