const {
    DEFAULT_TENANT_ID,
    normalizeTenantId,
    queryPostgres
} = require('../../../config/persistence-runtime');
const {
    resolveSecretPlain
} = require('../helpers/integrations-normalizers.helpers');

const GRAPH_API_VERSION = 'v19.0';
const DAILY_SYNC_HOUR = 1;

let schemaPromise = null;
let scheduleTimeout = null;
let scheduleInterval = null;
let runInFlight = null;
let backfillInFlight = null;

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

function addDays(dateLabel, daysDelta = 0) {
    const normalized = normalizeDateInput(dateLabel);
    if (!normalized) return null;
    const next = new Date(`${normalized}T00:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + Number(daysDelta || 0));
    return next.toISOString().slice(0, 10);
}

function getTodayDateLabel() {
    return new Date().toISOString().slice(0, 10);
}

function getYesterdayDateLabel() {
    return addDays(getTodayDateLabel(), -1);
}

function getCurrentYearStartLabel() {
    const now = new Date();
    return `${now.getUTCFullYear()}-01-01`;
}

function buildDateWindows(dateStart, dateStop, windowDays = 7) {
    const normalizedStart = normalizeDateInput(dateStart);
    const normalizedStop = normalizeDateInput(dateStop, normalizedStart);
    if (!normalizedStart || !normalizedStop) return [];
    const windows = [];
    const size = Math.max(1, Number(windowDays || 1));
    let cursor = normalizedStart;
    while (cursor <= normalizedStop) {
        const windowStop = addDays(cursor, size - 1);
        const safeStop = windowStop && windowStop < normalizedStop ? windowStop : normalizedStop;
        windows.push({ dateStart: cursor, dateStop: safeStop });
        cursor = addDays(safeStop, 1);
    }
    return windows;
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
              campaign_id TEXT,
              campaign_name TEXT,
              campaign_status TEXT,
              adset_id TEXT,
              adset_name TEXT,
              adset_status TEXT,
              ad_name TEXT,
              ad_status TEXT,
              actions JSONB,
              synced_at TIMESTAMPTZ DEFAULT NOW(),
              UNIQUE(tenant_id, object_id, date_start, date_stop)
            )
        `);
        await queryPostgres(`
            CREATE TABLE IF NOT EXISTS tenant_meta_ads_sync_state (
              tenant_id TEXT PRIMARY KEY,
              backfill_year INTEGER,
              backfill_started_at TIMESTAMPTZ DEFAULT NULL,
              backfill_completed_at TIMESTAMPTZ DEFAULT NULL,
              backfill_completed_through DATE DEFAULT NULL,
              last_structure_sync_at TIMESTAMPTZ DEFAULT NULL,
              last_insights_sync_from DATE DEFAULT NULL,
              last_insights_sync_to DATE DEFAULT NULL,
              last_insights_sync_at TIMESTAMPTZ DEFAULT NULL,
              updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        await queryPostgres(`
            CREATE TABLE IF NOT EXISTS tenant_meta_ads_creatives (
              tenant_id TEXT NOT NULL,
              ad_id TEXT NOT NULL,
              creative_id TEXT,
              greeting_text TEXT,
              autofill_message TEXT,
              buttons_json JSONB DEFAULT '[]'::jsonb,
              raw_creative JSONB DEFAULT '{}'::jsonb,
              synced_at TIMESTAMPTZ DEFAULT NOW(),
              PRIMARY KEY (tenant_id, ad_id)
            )
        `);
        await queryPostgres(`CREATE INDEX IF NOT EXISTS idx_tenant_meta_ads_structure_tenant_type ON tenant_meta_ads_structure(tenant_id, object_type)`);
        await queryPostgres(`CREATE INDEX IF NOT EXISTS idx_tenant_meta_ads_insights_tenant_type_dates ON tenant_meta_ads_insights(tenant_id, object_type, date_start, date_stop)`);
        await queryPostgres(`CREATE INDEX IF NOT EXISTS idx_meta_ads_creatives_tenant ON tenant_meta_ads_creatives(tenant_id)`);
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

function sleep(ms = 0) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms || 0))));
}

function chunkArray(items = [], size = 50) {
    const safeItems = Array.isArray(items) ? items : [];
    const chunkSize = Math.max(1, Number(size || 50));
    const chunks = [];
    for (let index = 0; index < safeItems.length; index += chunkSize) {
        chunks.push(safeItems.slice(index, index + chunkSize));
    }
    return chunks;
}

function extractMetaErrorCode(error = null) {
    if (!error) return null;
    const directCode = Number(error?.code || error?.error?.code || error?.metaCode);
    if (Number.isFinite(directCode)) return directCode;
    const body = parseJsonSafely(error?.body || error?.message, null);
    const bodyCode = Number(body?.error?.code || body?.code);
    return Number.isFinite(bodyCode) ? bodyCode : null;
}

async function callMetaBatch(adIds = [], accessToken = '') {
    const batch = (Array.isArray(adIds) ? adIds : [])
        .map((adId) => toText(adId))
        .filter(Boolean)
        .map((adId) => ({
            method: 'GET',
            relative_url: `${adId}?fields=creative{id,object_story_spec{link_data{page_welcome_message},video_data{page_welcome_message},template_data{page_welcome_message},photo_data{page_welcome_message},text_data{page_welcome_message}}}`
        }));
    if (batch.length === 0) return [];

    const response = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            access_token: accessToken,
            batch: JSON.stringify(batch)
        }).toString()
    });
    const rawBody = await response.text();
    const payload = parseJsonSafely(rawBody, null);
    if (!response.ok) {
        const error = new Error(`Meta Ads batch request failed (${response.status}): ${rawBody}`);
        error.status = response.status;
        error.body = rawBody;
        error.code = extractMetaErrorCode(payload);
        throw error;
    }
    if (!Array.isArray(payload)) {
        const error = new Error('Meta Ads batch response invalida.');
        error.body = rawBody;
        throw error;
    }
    return payload;
}

async function listConfiguredMetaAdsTenants() {
    await ensurePostgresSchema();
    const { rows } = await queryPostgres(
        `SELECT tenant_id
           FROM tenant_integrations
          WHERE COALESCE(config_json->'metaAds'->>'adAccountId', '') <> ''
            AND COALESCE(config_json->'metaAds'->>'accessToken', '') <> ''`
    );
    return Array.from(new Set((Array.isArray(rows) ? rows : []).map((row) => normalizeTenantId(row?.tenant_id)).filter(Boolean)));
}

async function getMetaAdsSyncState(tenantId = DEFAULT_TENANT_ID) {
    await ensurePostgresSchema();
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const { rows } = await queryPostgres(
        `SELECT tenant_id, backfill_year, backfill_started_at, backfill_completed_at, backfill_completed_through,
                last_structure_sync_at, last_insights_sync_from, last_insights_sync_to, last_insights_sync_at, updated_at
           FROM tenant_meta_ads_sync_state
          WHERE tenant_id = $1
          LIMIT 1`,
        [cleanTenantId]
    );
    return rows?.[0] || null;
}

async function getMaxHistoricalInsightsDate(tenantId = DEFAULT_TENANT_ID, year = null) {
    await ensurePostgresSchema();
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const targetYear = Number.isInteger(Number(year)) ? Number(year) : Number.parseInt(getCurrentYearStartLabel().slice(0, 4), 10);
    const rangeStart = `${targetYear}-01-01`;
    const rangeStop = `${targetYear}-12-31`;
    const { rows } = await queryPostgres(
        `SELECT MAX(date_stop) AS max_date
           FROM tenant_meta_ads_insights
          WHERE tenant_id = $1
            AND object_type = 'ad'
            AND date_start >= $2::date
            AND date_stop <= $3::date`,
        [cleanTenantId, rangeStart, rangeStop]
    );
    return normalizeDateInput(rows?.[0]?.max_date, null);
}

async function upsertMetaAdsSyncState(tenantId = DEFAULT_TENANT_ID, patch = {}) {
    await ensurePostgresSchema();
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const current = await getMetaAdsSyncState(cleanTenantId);
    const next = {
        tenant_id: cleanTenantId,
        backfill_year: Number.isInteger(Number(patch?.backfill_year))
            ? Number(patch.backfill_year)
            : (Number.isInteger(Number(current?.backfill_year)) ? Number(current.backfill_year) : null),
        backfill_started_at: patch?.backfill_started_at === null
            ? null
            : (patch?.backfill_started_at || current?.backfill_started_at || null),
        backfill_completed_at: patch?.backfill_completed_at === null
            ? null
            : (patch?.backfill_completed_at || current?.backfill_completed_at || null),
        backfill_completed_through: patch?.backfill_completed_through === null
            ? null
            : normalizeDateInput(patch?.backfill_completed_through, current?.backfill_completed_through || null),
        last_structure_sync_at: patch?.last_structure_sync_at === null
            ? null
            : (patch?.last_structure_sync_at || current?.last_structure_sync_at || null),
        last_insights_sync_from: patch?.last_insights_sync_from === null
            ? null
            : normalizeDateInput(patch?.last_insights_sync_from, current?.last_insights_sync_from || null),
        last_insights_sync_to: patch?.last_insights_sync_to === null
            ? null
            : normalizeDateInput(patch?.last_insights_sync_to, current?.last_insights_sync_to || null),
        last_insights_sync_at: patch?.last_insights_sync_at === null
            ? null
            : (patch?.last_insights_sync_at || current?.last_insights_sync_at || null)
    };

    await queryPostgres(
        `INSERT INTO tenant_meta_ads_sync_state (
            tenant_id, backfill_year, backfill_started_at, backfill_completed_at, backfill_completed_through,
            last_structure_sync_at, last_insights_sync_from, last_insights_sync_to, last_insights_sync_at, updated_at
         ) VALUES (
            $1, $2, $3::timestamptz, $4::timestamptz, $5::date, $6::timestamptz, $7::date, $8::date, $9::timestamptz, NOW()
         )
         ON CONFLICT (tenant_id)
         DO UPDATE SET
            backfill_year = COALESCE(EXCLUDED.backfill_year, tenant_meta_ads_sync_state.backfill_year),
            backfill_started_at = COALESCE(tenant_meta_ads_sync_state.backfill_started_at, EXCLUDED.backfill_started_at),
            backfill_completed_at = COALESCE(EXCLUDED.backfill_completed_at, tenant_meta_ads_sync_state.backfill_completed_at),
            backfill_completed_through = CASE
                WHEN tenant_meta_ads_sync_state.backfill_completed_through IS NULL THEN EXCLUDED.backfill_completed_through
                WHEN EXCLUDED.backfill_completed_through IS NULL THEN tenant_meta_ads_sync_state.backfill_completed_through
                ELSE GREATEST(tenant_meta_ads_sync_state.backfill_completed_through, EXCLUDED.backfill_completed_through)
            END,
            last_structure_sync_at = COALESCE(EXCLUDED.last_structure_sync_at, tenant_meta_ads_sync_state.last_structure_sync_at),
            last_insights_sync_from = COALESCE(EXCLUDED.last_insights_sync_from, tenant_meta_ads_sync_state.last_insights_sync_from),
            last_insights_sync_to = CASE
                WHEN tenant_meta_ads_sync_state.last_insights_sync_to IS NULL THEN EXCLUDED.last_insights_sync_to
                WHEN EXCLUDED.last_insights_sync_to IS NULL THEN tenant_meta_ads_sync_state.last_insights_sync_to
                ELSE GREATEST(tenant_meta_ads_sync_state.last_insights_sync_to, EXCLUDED.last_insights_sync_to)
            END,
            last_insights_sync_at = COALESCE(EXCLUDED.last_insights_sync_at, tenant_meta_ads_sync_state.last_insights_sync_at),
            updated_at = NOW()`,
        [
            next.tenant_id,
            next.backfill_year,
            next.backfill_started_at,
            next.backfill_completed_at,
            next.backfill_completed_through,
            next.last_structure_sync_at,
            next.last_insights_sync_from,
            next.last_insights_sync_to,
            next.last_insights_sync_at
        ]
    );

    return getMetaAdsSyncState(cleanTenantId);
}

async function upsertStructureRow(tenantId, row = {}) {
    await queryPostgres(
        `INSERT INTO tenant_meta_ads_structure (
            tenant_id, object_type, object_id, object_name, parent_id, status, synced_at
         ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (tenant_id, object_id)
         DO UPDATE SET
            object_type = COALESCE(EXCLUDED.object_type, tenant_meta_ads_structure.object_type),
            object_name = COALESCE(EXCLUDED.object_name, tenant_meta_ads_structure.object_name),
            parent_id = COALESCE(EXCLUDED.parent_id, tenant_meta_ads_structure.parent_id),
            status = COALESCE(EXCLUDED.status, tenant_meta_ads_structure.status),
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

function parsePageWelcomeMessage(rawWelcome = null) {
    if (!rawWelcome) return null;
    if (typeof rawWelcome === 'string') {
        try {
            return JSON.parse(rawWelcome);
        } catch (error) {
            console.warn('[MetaSync] No se pudo parsear page_welcome_message:', String(error?.message || error));
            return null;
        }
    }
    return isPlainObject(rawWelcome) ? rawWelcome : null;
}

function normalizeGreetingText(value = '') {
    const text = toNullableText(value);
    return text ? text.replace(/\{\{user_first_name\}\}/g, '{{nombre}}').trim() : null;
}

function normalizeCreativeButtons(welcomeObj = {}) {
    const source = isPlainObject(welcomeObj) ? welcomeObj : {};
    const textFormat = isPlainObject(source?.text_format) ? source.text_format : {};
    const message = isPlainObject(textFormat?.message) ? textFormat.message : {};
    const iceBreakers = Array.isArray(message?.ice_breakers)
        ? message.ice_breakers
        : (Array.isArray(source?.ice_breakers) ? source.ice_breakers : []);
    const quickReplies = Array.isArray(message?.quick_replies)
        ? message.quick_replies
        : (Array.isArray(source?.quick_replies) ? source.quick_replies : []);

    return [
        ...iceBreakers.filter((button) => button?.title).map((button) => ({
            title: toNullableText(button?.title),
            type: 'ice_breaker'
        })),
        ...quickReplies.filter((button) => button?.title).map((button) => ({
            title: toNullableText(button?.title),
            type: 'quick_reply'
        }))
    ].filter((button) => button.title);
}

function extractCreativePayload(adId = '', payload = {}) {
    const source = isPlainObject(payload) ? payload : {};
    const creative = isPlainObject(source?.creative) ? source.creative : {};
    const storySpec = isPlainObject(creative?.object_story_spec) ? creative.object_story_spec : {};
    const candidates = [
        storySpec?.link_data,
        storySpec?.video_data,
        storySpec?.template_data,
        storySpec?.offer_data,
        storySpec?.photo_data,
        storySpec?.text_data
    ].filter(isPlainObject);
    const dataSource = candidates.find((entry) => entry?.page_welcome_message) || null;
    const pageWelcomeMessage = parsePageWelcomeMessage(dataSource?.page_welcome_message);
    const textFormat = isPlainObject(pageWelcomeMessage?.text_format) ? pageWelcomeMessage.text_format : {};
    const message = isPlainObject(textFormat?.message) ? textFormat.message : {};
    const welcomeMessage = isPlainObject(pageWelcomeMessage?.message) ? pageWelcomeMessage.message : {};
    const autofillMessage = isPlainObject(message?.autofill_message)
        ? message.autofill_message
        : (isPlainObject(pageWelcomeMessage?.autofill_message) ? pageWelcomeMessage.autofill_message : {});

    return {
        ad_id: toText(adId),
        creative_id: toNullableText(creative?.id),
        greeting_text: normalizeGreetingText(message?.text || welcomeMessage?.text || pageWelcomeMessage?.text),
        autofill_message: toNullableText(autofillMessage?.content),
        buttons_json: normalizeCreativeButtons(pageWelcomeMessage),
        raw_creative: source
    };
}

async function upsertCreativeRow(tenantId, row = {}) {
    await queryPostgres(
        `INSERT INTO tenant_meta_ads_creatives (
            tenant_id, ad_id, creative_id, greeting_text, autofill_message, buttons_json, raw_creative, synced_at
         ) VALUES (
            $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, NOW()
         )
         ON CONFLICT (tenant_id, ad_id)
         DO UPDATE SET
            creative_id = COALESCE(EXCLUDED.creative_id, tenant_meta_ads_creatives.creative_id),
            greeting_text = COALESCE(EXCLUDED.greeting_text, tenant_meta_ads_creatives.greeting_text),
            autofill_message = COALESCE(EXCLUDED.autofill_message, tenant_meta_ads_creatives.autofill_message),
            buttons_json = COALESCE(EXCLUDED.buttons_json, tenant_meta_ads_creatives.buttons_json),
            raw_creative = COALESCE(EXCLUDED.raw_creative, tenant_meta_ads_creatives.raw_creative),
            synced_at = NOW()`,
        [
            tenantId,
            row.ad_id,
            row.creative_id,
            row.greeting_text,
            row.autofill_message,
            JSON.stringify(Array.isArray(row.buttons_json) ? row.buttons_json : []),
            JSON.stringify(isPlainObject(row.raw_creative) ? row.raw_creative : {})
        ]
    );
}

async function updateCreativeParsedFields(tenantId, row = {}) {
    await queryPostgres(
        `UPDATE tenant_meta_ads_creatives
            SET greeting_text = $3,
                autofill_message = $4,
                buttons_json = $5::jsonb,
                synced_at = NOW()
          WHERE tenant_id = $1
            AND ad_id = $2`,
        [
            tenantId,
            row.ad_id,
            row.greeting_text,
            row.autofill_message,
            JSON.stringify(Array.isArray(row.buttons_json) ? row.buttons_json : [])
        ]
    );
}

async function upsertInsightRow(tenantId, row = {}) {
    await queryPostgres(
        `INSERT INTO tenant_meta_ads_insights (
            tenant_id, object_id, object_type, date_start, date_stop, spend, impressions, reach, clicks, ctr, cpc, cpm, cpp, frequency,
            campaign_id, campaign_name, campaign_status, adset_id, adset_name, adset_status, ad_name, ad_status,
            actions, synced_at
         ) VALUES (
            $1, $2, $3, $4::date, $5::date, $6, $7, $8, $9, $10, $11, $12, $13, $14,
            $15, $16, $17, $18, $19, $20, $21, $22,
            $23::jsonb, NOW()
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
            campaign_id = COALESCE(EXCLUDED.campaign_id, tenant_meta_ads_insights.campaign_id),
            campaign_name = COALESCE(EXCLUDED.campaign_name, tenant_meta_ads_insights.campaign_name),
            campaign_status = COALESCE(EXCLUDED.campaign_status, tenant_meta_ads_insights.campaign_status),
            adset_id = COALESCE(EXCLUDED.adset_id, tenant_meta_ads_insights.adset_id),
            adset_name = COALESCE(EXCLUDED.adset_name, tenant_meta_ads_insights.adset_name),
            adset_status = COALESCE(EXCLUDED.adset_status, tenant_meta_ads_insights.adset_status),
            ad_name = COALESCE(EXCLUDED.ad_name, tenant_meta_ads_insights.ad_name),
            ad_status = COALESCE(EXCLUDED.ad_status, tenant_meta_ads_insights.ad_status),
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
            row.campaign_id,
            row.campaign_name,
            row.campaign_status,
            row.adset_id,
            row.adset_name,
            row.adset_status,
            row.ad_name,
            row.ad_status,
            JSON.stringify(Array.isArray(row.actions) ? row.actions : [])
        ]
    );
}

async function syncMetaAdsStructure(tenantId = DEFAULT_TENANT_ID) {
    const config = await getMetaAdsConfig(tenantId);

    const [campaigns, adsets, ads] = await Promise.all([
        fetchMetaAdsPages({
            path: `${config.adAccountId}/campaigns`,
            params: { fields: 'id,name,status,objective', limit: '100' },
            accessToken: config.accessToken
        }),
        fetchMetaAdsPages({
            path: `${config.adAccountId}/adsets`,
            params: { fields: 'id,name,status,campaign_id', limit: '100' },
            accessToken: config.accessToken
        }),
        fetchMetaAdsPages({
            path: `${config.adAccountId}/ads`,
            params: { fields: 'id,name,status,adset_id,campaign_id', limit: '100' },
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

    await upsertMetaAdsSyncState(config.tenantId, {
        last_structure_sync_at: new Date().toISOString()
    });

    return {
        campaignsCount: campaigns.length,
        adsetsCount: adsets.length,
        adsCount: ads.length,
        totalCount: campaigns.length + adsets.length + ads.length
    };
}

async function reprocessExistingCreatives(tenantId = DEFAULT_TENANT_ID) {
    await ensurePostgresSchema();
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const { rows } = await queryPostgres(
        `SELECT ad_id, raw_creative
           FROM tenant_meta_ads_creatives
          WHERE tenant_id = $1
            AND raw_creative IS NOT NULL
            AND raw_creative <> '{}'::jsonb
            AND (greeting_text IS NULL OR TRIM(greeting_text) = '')`,
        [cleanTenantId]
    );
    let reprocessedCount = 0;
    for (const row of (Array.isArray(rows) ? rows : [])) {
        const adId = toText(row?.ad_id);
        if (!adId) continue;
        const parsed = extractCreativePayload(adId, row?.raw_creative);
        if (!parsed.greeting_text && !parsed.autofill_message && (!Array.isArray(parsed.buttons_json) || parsed.buttons_json.length === 0)) {
            continue;
        }
        await updateCreativeParsedFields(cleanTenantId, parsed);
        reprocessedCount += 1;
    }
    return {
        tenantId: cleanTenantId,
        scannedCount: Array.isArray(rows) ? rows.length : 0,
        reprocessedCount
    };
}

async function syncAdCreatives(tenantId = DEFAULT_TENANT_ID, configOverride = null) {
    await ensurePostgresSchema();
    const config = configOverride && typeof configOverride === 'object'
        ? configOverride
        : await getMetaAdsConfig(tenantId);
    const cleanTenantId = normalizeTenantId(config?.tenantId || tenantId || DEFAULT_TENANT_ID);
    const { rows } = await queryPostgres(
        `SELECT s.object_id,
                CASE WHEN c.creative_id IS NOT NULL THEN TRUE ELSE FALSE END AS already_synced
           FROM tenant_meta_ads_structure s
           LEFT JOIN tenant_meta_ads_creatives c
             ON c.tenant_id = s.tenant_id
            AND c.ad_id = s.object_id
          WHERE s.tenant_id = $1
            AND s.object_type = 'ad'
            AND COALESCE(s.object_id, '') <> ''
            AND (
              s.status = 'ACTIVE'
              OR (s.status = 'PAUSED' AND c.creative_id IS NOT NULL)
            )
          ORDER BY s.synced_at DESC NULLS LAST, s.object_id ASC`,
        [cleanTenantId]
    );
    const ads = (Array.isArray(rows) ? rows : []).map((row) => toText(row?.object_id)).filter(Boolean);
    let syncedCount = 0;
    let failedCount = 0;
    const batches = chunkArray(ads, 50);

    const processBatchResults = async (batchAdIds = [], results = []) => {
        for (let index = 0; index < batchAdIds.length; index += 1) {
            const adId = batchAdIds[index];
            const item = results[index] || {};
            if (Number(item?.code || 0) !== 200) {
                const itemError = parseJsonSafely(item?.body, null);
                if (extractMetaErrorCode(itemError) === 17) {
                    const error = new Error('Meta Ads rate limit en batch item.');
                    error.code = 17;
                    error.error = itemError?.error || itemError;
                    throw error;
                }
                failedCount += 1;
                console.warn('[meta-ads-sync] Creative batch item fallo.', {
                    tenantId: cleanTenantId,
                    adId,
                    code: item?.code || null,
                    body: String(item?.body || '').slice(0, 500)
                });
                continue;
            }
            const creativePayload = parseJsonSafely(item?.body, null);
            if (!isPlainObject(creativePayload)) {
                failedCount += 1;
                console.warn('[meta-ads-sync] Creative batch item sin JSON valido.', {
                    tenantId: cleanTenantId,
                    adId
                });
                continue;
            }
            const normalized = extractCreativePayload(adId, creativePayload);
            await upsertCreativeRow(cleanTenantId, normalized);
            syncedCount += 1;
        }
    };

    for (const batch of batches) {
        try {
            const results = await callMetaBatch(batch, config.accessToken);
            await processBatchResults(batch, results);
        } catch (error) {
            if (extractMetaErrorCode(error) === 17) {
                console.warn('[MetaSync] Rate limit, esperando 120s...');
                await sleep(120000);
                try {
                    const results = await callMetaBatch(batch, config.accessToken);
                    await processBatchResults(batch, results);
                } catch (retryError) {
                    failedCount += batch.length;
                    console.error('[MetaSync] Retry fallo, saltando batch', {
                        tenantId: cleanTenantId,
                        error: String(retryError?.message || retryError)
                    });
                }
            } else {
                failedCount += batch.length;
                console.error('[MetaSync] Error en batch:', {
                    tenantId: cleanTenantId,
                    error: String(error?.message || error)
                });
            }
        }
        await sleep(5000);
    }

    const reprocess = await reprocessExistingCreatives(cleanTenantId);

    return {
        tenantId: cleanTenantId,
        adsCount: ads.length,
        creativesCount: syncedCount,
        failedCount,
        reprocessedCount: Number(reprocess?.reprocessedCount || 0)
    };
}

async function syncMetaAdsInsights(tenantId = DEFAULT_TENANT_ID, dateStart, dateStop, options = {}) {
    const config = await getMetaAdsConfig(tenantId);
    const normalizedDateStart = normalizeDateInput(dateStart);
    const normalizedDateStop = normalizeDateInput(dateStop, normalizedDateStart);
    if (!normalizedDateStart || !normalizedDateStop) {
        throw new Error('Rango de fechas invalido para Meta Ads.');
    }

    const insightRows = await fetchMetaAdsPages({
        path: `${config.adAccountId}/insights`,
        params: {
            fields: 'ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,date_start,date_stop,spend,impressions,reach,clicks,ctr,cpc,cpm,cpp,frequency,actions',
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
        adset_name: toNullableText(row?.adset_name),
        adset_status: null,
        campaign_id: toNullableText(row?.campaign_id),
        campaign_name: toNullableText(row?.campaign_name),
        campaign_status: null,
        ad_name: toNullableText(row?.ad_name),
        ad_status: null
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

    for (const row of adRows) {
        if (row.campaign_id) {
            await upsertStructureRow(config.tenantId, {
                object_type: 'campaign',
                object_id: row.campaign_id,
                object_name: row.campaign_name,
                parent_id: null,
                status: row.campaign_status
            });
        }
        if (row.adset_id) {
            await upsertStructureRow(config.tenantId, {
                object_type: 'adset',
                object_id: row.adset_id,
                object_name: row.adset_name,
                parent_id: row.campaign_id,
                status: row.adset_status
            });
        }
        await upsertStructureRow(config.tenantId, {
            object_type: 'ad',
            object_id: row.object_id,
            object_name: row.ad_name,
            parent_id: row.adset_id,
            status: row.ad_status
        });
    }

    for (const row of allRows) {
        await upsertInsightRow(config.tenantId, row);
    }

    if (options?.updateSyncState !== false) {
        await upsertMetaAdsSyncState(config.tenantId, {
            last_insights_sync_from: normalizedDateStart,
            last_insights_sync_to: normalizedDateStop,
            last_insights_sync_at: new Date().toISOString()
        });
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
            COALESCE(i.campaign_id, adset.parent_id, campaign.object_id) AS campaign_id,
            COALESCE(i.campaign_name, campaign.object_name) AS campaign_name,
            COALESCE(i.campaign_status, campaign.status) AS campaign_status,
            COALESCE(i.adset_id, ad.parent_id, adset.object_id) AS adset_id,
            COALESCE(i.adset_name, adset.object_name) AS adset_name,
            COALESCE(i.adset_status, adset.status) AS adset_status,
            i.object_id AS ad_id,
            COALESCE(i.ad_name, ad.object_name) AS ad_name,
            COALESCE(i.ad_status, ad.status) AS ad_status,
            SUM(i.spend) AS spend,
            SUM(i.impressions) AS impressions,
            SUM(i.reach) AS reach,
            SUM(i.clicks) AS clicks,
            cr.creative_id AS creative_id,
            cr.greeting_text AS greeting_text,
            cr.autofill_message AS autofill_message,
            cr.buttons_json AS buttons_json,
            CASE WHEN SUM(i.impressions) > 0
              THEN ROUND(SUM(i.clicks)::numeric / SUM(i.impressions) * 100, 4)
              ELSE NULL
            END AS ctr,
            CASE WHEN SUM(i.clicks) > 0
              THEN ROUND(SUM(i.spend)::numeric / SUM(i.clicks), 4)
              ELSE NULL
            END AS cpc,
            CASE WHEN SUM(i.impressions) > 0
              THEN ROUND(SUM(i.spend)::numeric / SUM(i.impressions) * 1000, 4)
              ELSE NULL
            END AS cpm,
            CASE WHEN SUM(i.reach) > 0
              THEN ROUND(SUM(i.impressions)::numeric / SUM(i.reach), 4)
              ELSE NULL
            END AS frequency,
            SUM(
              COALESCE((
                SELECT SUM((action_item->>'value')::numeric)
                  FROM jsonb_array_elements(COALESCE(i.actions, '[]'::jsonb)) action_item
                 WHERE action_item->>'action_type' IN (
                   'messaging_conversation_started_7d',
                   'onsite_conversion.total_messaging_connection'
                 )
              ), 0)
            ) AS messaging_conversations,
            MIN(i.date_start) AS date_start,
            MAX(i.date_stop) AS date_stop,
            COUNT(DISTINCT i.date_start) AS days_active
         FROM tenant_meta_ads_insights i
         LEFT JOIN tenant_meta_ads_structure ad
           ON ad.tenant_id = i.tenant_id
          AND ad.object_id = i.object_id
          AND ad.object_type = 'ad'
         LEFT JOIN tenant_meta_ads_structure adset
           ON adset.tenant_id = i.tenant_id
          AND adset.object_id = COALESCE(i.adset_id, ad.parent_id)
          AND adset.object_type = 'adset'
         LEFT JOIN tenant_meta_ads_structure campaign
           ON campaign.tenant_id = i.tenant_id
          AND campaign.object_id = COALESCE(i.campaign_id, adset.parent_id)
          AND campaign.object_type = 'campaign'
         LEFT JOIN tenant_meta_ads_creatives cr
           ON cr.tenant_id = i.tenant_id
          AND cr.ad_id = i.object_id
         WHERE i.tenant_id = $1
           AND i.object_type = 'ad'
           AND i.date_start >= $2::date
           AND i.date_stop <= $3::date
         GROUP BY
            i.object_id,
            COALESCE(i.ad_name, ad.object_name),
            COALESCE(i.ad_status, ad.status),
            COALESCE(i.adset_id, ad.parent_id, adset.object_id),
            COALESCE(i.adset_name, adset.object_name),
            COALESCE(i.adset_status, adset.status),
            COALESCE(i.campaign_id, adset.parent_id, campaign.object_id),
            COALESCE(i.campaign_name, campaign.object_name),
            COALESCE(i.campaign_status, campaign.status),
            cr.creative_id,
            cr.greeting_text,
            cr.autofill_message,
            cr.buttons_json
         ORDER BY SUM(i.spend) DESC NULLS LAST,
            campaign_name NULLS LAST,
            adset_name NULLS LAST,
            ad_name NULLS LAST`,
        [cleanTenantId, normalizedDateStart, normalizedDateStop]
    );

    return (Array.isArray(rows) ? rows : []).map((row) => {
        const spend = toNumber(row?.spend, 0, { decimals: 2 });
        const messagingConversations = toNumber(row?.messaging_conversations, 0, { decimals: 4 });
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
            creative_id: toNullableText(row?.creative_id),
            greeting_text: toNullableText(row?.greeting_text),
            autofill_message: toNullableText(row?.autofill_message),
            buttons_json: Array.isArray(row?.buttons_json) ? row.buttons_json : [],
            ctr: toNumber(row?.ctr, 0, { decimals: 4 }),
            cpc: toNumber(row?.cpc, 0, { decimals: 4 }),
            cpm: toNumber(row?.cpm, 0, { decimals: 4 }),
            frequency: toNumber(row?.frequency, 0, { decimals: 4 }),
            messaging_conversations: messagingConversations,
            cost_per_conversation: messagingConversations > 0 ? toNumber(spend / messagingConversations, 0, { decimals: 4 }) : 0,
            date_start: normalizeDateInput(row?.date_start),
            date_stop: normalizeDateInput(row?.date_stop),
            days_active: toInteger(row?.days_active, 0)
        };
    });
}

async function updateMetaAdCreativeGreeting(tenantId = DEFAULT_TENANT_ID, adId = '', greetingText = '') {
    await ensurePostgresSchema();
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const cleanAdId = toText(adId);
    if (!cleanAdId) throw new Error('adId requerido para actualizar greeting Meta.');
    const cleanGreeting = toNullableText(greetingText);
    await queryPostgres(
        `INSERT INTO tenant_meta_ads_creatives (
            tenant_id, ad_id, greeting_text, buttons_json, raw_creative, synced_at
        ) VALUES (
            $1, $2, $3, '[]'::jsonb, '{}'::jsonb, NOW()
        )
        ON CONFLICT (tenant_id, ad_id)
        DO UPDATE SET
            greeting_text = EXCLUDED.greeting_text,
            synced_at = NOW()`,
        [cleanTenantId, cleanAdId, cleanGreeting]
    );
    return {
        ok: true,
        tenantId: cleanTenantId,
        adId: cleanAdId,
        greetingText: cleanGreeting
    };
}

async function getMetaAdConversationStats(tenantId = DEFAULT_TENANT_ID, adId = '') {
    await ensurePostgresSchema();
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const cleanAdId = toText(adId);
    if (!cleanAdId) throw new Error('adId requerido para estadisticas Meta.');
    try {
        const { rows } = await queryPostgres(
            `SELECT
                COUNT(*)::INT AS total_conversations,
                COUNT(*) FILTER (
                    WHERE tcs.status IN ('cotizado', 'aceptado', 'vendido')
                )::INT AS converted,
                MIN(o.detected_at) AS first_seen,
                MAX(o.detected_at) AS last_seen,
                MAX(NULLIF(o.referral_source_url, '')) AS source_url
             FROM tenant_chat_origins o
             LEFT JOIN tenant_chat_commercial_status tcs
               ON tcs.tenant_id = o.tenant_id
              AND tcs.chat_id = o.chat_id
             WHERE o.tenant_id = $1
               AND o.referral_source_id = $2`,
            [cleanTenantId, cleanAdId]
        );
        const row = rows?.[0] || {};
        const total = toInteger(row?.total_conversations, 0);
        const converted = toInteger(row?.converted, 0);
        return {
            totalConversations: total,
            converted,
            conversionRate: total > 0 ? toNumber((converted / total) * 100, 0, { decimals: 2 }) : 0,
            firstSeen: row?.first_seen || null,
            lastSeen: row?.last_seen || null,
            sourceUrl: toNullableText(row?.source_url)
        };
    } catch (error) {
        if (String(error?.code || '').trim() === '42P01') {
            return {
                totalConversations: 0,
                converted: 0,
                conversionRate: 0,
                firstSeen: null,
                lastSeen: null,
                sourceUrl: null
            };
        }
        throw error;
    }
}

async function syncMetaAdsHistoricalCurrentYear(tenantId = DEFAULT_TENANT_ID, options = {}) {
    await ensurePostgresSchema();
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const yearStart = getCurrentYearStartLabel();
    const historicalStop = normalizeDateInput(options?.dateStop, getYesterdayDateLabel());
    if (!historicalStop || historicalStop < yearStart) {
        return {
            ok: true,
            tenantId: cleanTenantId,
            skipped: true,
            reason: 'No hay rango historico pendiente para sincronizar.'
        };
    }

    const currentYear = Number.parseInt(yearStart.slice(0, 4), 10);
    const state = await getMetaAdsSyncState(cleanTenantId);
    const maxHistoricalInsightsDate = await getMaxHistoricalInsightsDate(cleanTenantId, currentYear);
    const force = options?.force === true;
    const alreadyCompletedThrough = [normalizeDateInput(state?.backfill_completed_through, null), maxHistoricalInsightsDate]
        .filter(Boolean)
        .sort()
        .slice(-1)[0] || null;
    const alreadyCompleted =
        !force
        && Number(state?.backfill_year || 0) === currentYear
        && alreadyCompletedThrough
        && alreadyCompletedThrough >= historicalStop;

    if (alreadyCompleted) {
        if (alreadyCompletedThrough && alreadyCompletedThrough !== normalizeDateInput(state?.backfill_completed_through, null)) {
            await upsertMetaAdsSyncState(cleanTenantId, {
                backfill_year: currentYear,
                backfill_completed_at: state?.backfill_completed_at || new Date().toISOString(),
                backfill_completed_through: alreadyCompletedThrough
            });
        }
        return {
            ok: true,
            tenantId: cleanTenantId,
            skipped: true,
            year: currentYear,
            dateStart: yearStart,
            dateStop: historicalStop,
            completedThrough: alreadyCompletedThrough
        };
    }

    const resumeStart = (!force
        && Number(state?.backfill_year || 0) === currentYear
        && alreadyCompletedThrough
        && alreadyCompletedThrough >= yearStart)
        ? addDays(alreadyCompletedThrough, 1)
        : yearStart;

    if (!resumeStart || resumeStart > historicalStop) {
        await upsertMetaAdsSyncState(cleanTenantId, {
            backfill_year: currentYear,
            backfill_started_at: state?.backfill_started_at || new Date().toISOString(),
            backfill_completed_at: new Date().toISOString(),
            backfill_completed_through: historicalStop
        });
        return {
            ok: true,
            tenantId: cleanTenantId,
            skipped: true,
            year: currentYear,
            dateStart: yearStart,
            dateStop: historicalStop,
            completedThrough: historicalStop
        };
    }

    await upsertMetaAdsSyncState(cleanTenantId, {
        backfill_year: currentYear,
        backfill_started_at: new Date().toISOString(),
        backfill_completed_at: null,
        backfill_completed_through: force ? null : alreadyCompletedThrough
    });

    const structure = await syncMetaAdsStructure(cleanTenantId);
    const windows = buildDateWindows(resumeStart, historicalStop, Number(options?.windowDays || 7));
    let insightsCount = 0;
    let completedThrough = force ? null : alreadyCompletedThrough;

    for (const window of windows) {
        const result = await syncMetaAdsInsights(cleanTenantId, window.dateStart, window.dateStop, {
            updateSyncState: false
        });
        insightsCount += Number(result?.insightsCount || 0);
        completedThrough = window.dateStop;
        await upsertMetaAdsSyncState(cleanTenantId, {
            backfill_year: currentYear,
            backfill_started_at: state?.backfill_started_at || new Date().toISOString(),
            backfill_completed_through: completedThrough,
            last_insights_sync_from: window.dateStart,
            last_insights_sync_to: window.dateStop,
            last_insights_sync_at: new Date().toISOString()
        });
    }

    await upsertMetaAdsSyncState(cleanTenantId, {
        backfill_year: currentYear,
        backfill_completed_at: new Date().toISOString(),
        backfill_completed_through: completedThrough || historicalStop
    });

    return {
        ok: true,
        tenantId: cleanTenantId,
        skipped: false,
        year: currentYear,
        dateStart: resumeStart,
        dateStop: historicalStop,
        completedThrough: completedThrough || historicalStop,
        windowsCount: windows.length,
        structure,
        insightsCount
    };
}

async function runMetaAdsDailySyncOnce() {
    if (runInFlight) return runInFlight;
    runInFlight = (async () => {
        await ensurePostgresSchema();
        const tenants = await listConfiguredMetaAdsTenants();
        const dateLabel = getYesterdayDateLabel();
        const results = [];

        for (const tenantId of tenants) {
            try {
                const structure = await syncMetaAdsStructure(tenantId);
                const insights = await syncMetaAdsInsights(tenantId, dateLabel, dateLabel);
                const creatives = await syncAdCreatives(tenantId);
                results.push({ tenantId, ok: true, structure, insights, creatives });
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

async function backfillConfiguredTenantsCurrentYear(options = {}) {
    if (backfillInFlight) return backfillInFlight;
    backfillInFlight = (async () => {
        const tenants = await listConfiguredMetaAdsTenants();
        const results = [];
        for (const tenantId of tenants) {
            try {
                const result = await syncMetaAdsHistoricalCurrentYear(tenantId, options);
                results.push({ tenantId, ok: true, result });
            } catch (error) {
                results.push({ tenantId, ok: false, error: String(error?.message || error) });
            }
        }
        return {
            ok: true,
            year: Number.parseInt(getCurrentYearStartLabel().slice(0, 4), 10),
            tenants: results
        };
    })();

    try {
        return await backfillInFlight;
    } finally {
        backfillInFlight = null;
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
    getMetaAdsSyncState,
    syncMetaAdsStructure,
    syncAdCreatives,
    reprocessExistingCreatives,
    syncMetaAdsInsights,
    listMetaAdsInsights,
    updateMetaAdCreativeGreeting,
    getMetaAdConversationStats,
    syncMetaAdsHistoricalCurrentYear,
    runMetaAdsDailySyncOnce,
    backfillConfiguredTenantsCurrentYear,
    startDailySync
};
