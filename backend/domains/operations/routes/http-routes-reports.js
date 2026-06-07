const {
    getStorageDriver,
    queryPostgres
} = require('../../../config/persistence-runtime');

const REPORT_TIME_ZONE = 'America/Lima';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = {
    mon: 'lun',
    tue: 'mar',
    wed: 'mie',
    thu: 'jue',
    fri: 'vie',
    sat: 'sab',
    sun: 'dom'
};
const WEEKDAY_TO_KEY = {
    Mon: 'mon',
    Tue: 'tue',
    Wed: 'wed',
    Thu: 'thu',
    Fri: 'fri',
    Sat: 'sat',
    Sun: 'sun'
};

const SENT_BY_USER_SQL = `COALESCE(
    m.metadata->>'sentByUserId',
    m.metadata->'agentMeta'->>'sentByUserId',
    m.author_id,
    m.sender_id,
    ''
)`;

const MESSAGE_MODULE_SQL = `LOWER(COALESCE(
    m.wa_module_id,
    m.metadata->>'sentViaModuleId',
    m.metadata->'agentMeta'->>'sentViaModuleId',
    ''
))`;

const ORDER_REVENUE_STATUSES_SQL = `('aceptado', 'programado', 'atendido', 'vendido')`;

const SCOPED_CHATS_CTE = `
scoped_chats AS (
    SELECT c.chat_id
      FROM tenant_chats c
     WHERE c.tenant_id = $1
       AND NOT EXISTS (
            SELECT 1
              FROM tenant_test_contacts tc
             WHERE tc.tenant_id = c.tenant_id
               AND regexp_replace(COALESCE(c.chat_id, ''), '[^0-9]', '', 'g')
                   LIKE '%' || regexp_replace(COALESCE(tc.phone_e164, ''), '[^0-9]', '', 'g') || '%'
       )
       AND (
            $4::text IS NULL
            OR EXISTS (
                SELECT 1
                  FROM tenant_chat_assignments a
                 WHERE a.tenant_id = c.tenant_id
                   AND a.chat_id = c.chat_id
                   AND a.assignee_user_id = $4::text
            )
            OR EXISTS (
                SELECT 1
                  FROM tenant_messages m
                 WHERE m.tenant_id = c.tenant_id
                   AND m.chat_id = c.chat_id
                   AND m.from_me = true
                   AND ${SENT_BY_USER_SQL} = $4::text
            )
            OR EXISTS (
                SELECT 1
                  FROM tenant_quotes q
                 WHERE q.tenant_id = c.tenant_id
                   AND q.chat_id = c.chat_id
                   AND q.created_by_user_id = $4::text
            )
            OR EXISTS (
                SELECT 1
                  FROM tenant_orders o
                 WHERE o.tenant_id = c.tenant_id
                   AND o.chat_id = c.chat_id
                   AND (
                        o.created_by_user_id = $4::text
                        OR o.assigned_user_id = $4::text
                   )
            )
       )
       AND (
            $5::text IS NULL
            OR EXISTS (
                SELECT 1
                  FROM tenant_messages m
                 WHERE m.tenant_id = c.tenant_id
                   AND m.chat_id = c.chat_id
                   AND ${MESSAGE_MODULE_SQL} = LOWER($5::text)
            )
            OR EXISTS (
                SELECT 1
                  FROM tenant_chat_commercial_status s
                 WHERE s.tenant_id = c.tenant_id
                   AND s.chat_id = c.chat_id
                   AND LOWER(COALESCE(s.scope_module_id, '')) = LOWER($5::text)
            )
            OR EXISTS (
                SELECT 1
                  FROM tenant_chat_assignments a
                 WHERE a.tenant_id = c.tenant_id
                   AND a.chat_id = c.chat_id
                   AND LOWER(COALESCE(a.scope_module_id, '')) = LOWER($5::text)
            )
            OR EXISTS (
                SELECT 1
                  FROM tenant_quotes q
                 WHERE q.tenant_id = c.tenant_id
                   AND q.chat_id = c.chat_id
                   AND LOWER(COALESCE(q.scope_module_id, '')) = LOWER($5::text)
            )
            OR EXISTS (
                SELECT 1
                  FROM tenant_orders o
                 WHERE o.tenant_id = c.tenant_id
                   AND o.chat_id = c.chat_id
                   AND LOWER(COALESCE(o.scope_module_id, '')) = LOWER($5::text)
            )
       )
)`;

function ensureAuthenticated(req, res, authService) {
    if (authService?.isAuthEnabled?.() && !req?.authContext?.isAuthenticated) {
        res.status(401).json({ ok: false, error: 'No autenticado.' });
        return false;
    }
    return true;
}

function cleanText(value = '') {
    return String(value ?? '').trim();
}

function nullableText(value = '') {
    const clean = cleanText(value);
    return clean ? clean : null;
}

function normalizePhoneE164(value = '') {
    const raw = cleanText(value);
    const digits = raw.replace(/\D/g, '');
    if (!digits) return '';
    return `+${digits}`;
}

function normalizePhoneDigits(value = '') {
    return cleanText(value).replace(/\D/g, '');
}

function getDateLabelInTimeZone(date = new Date(), timeZone = REPORT_TIME_ZONE) {
    const safeDate = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(safeDate.getTime())) return '';
    return safeDate.toLocaleDateString('en-CA', { timeZone });
}

function addDaysLabel(label = '', days = 0) {
    if (!DATE_PATTERN.test(label)) return '';
    const [year, month, day] = label.split('-').map((part) => Number(part));
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function parseDateRange(query = {}) {
    const today = getDateLabelInTimeZone();
    const defaultFrom = addDaysLabel(today, -6);
    const dateFrom = cleanText(query.dateFrom || query.dateStart || defaultFrom);
    const dateTo = cleanText(query.dateTo || query.dateStop || today);
    if (!DATE_PATTERN.test(dateFrom) || !DATE_PATTERN.test(dateTo)) {
        throw new Error('dateFrom y dateTo deben tener formato YYYY-MM-DD.');
    }
    if (dateFrom > dateTo) {
        throw new Error('dateFrom no puede ser mayor que dateTo.');
    }
    return { dateFrom, dateTo };
}

function resolveTenantId(req = {}) {
    const direct = cleanText(req.query?.tenantId || req.body?.tenantId);
    if (direct) return direct;
    const user = req.authContext?.user && typeof req.authContext.user === 'object'
        ? req.authContext.user
        : {};
    const userTenant = cleanText(user.tenantId || user.tenant_id);
    if (userTenant) return userTenant;
    const membership = (Array.isArray(user.memberships) ? user.memberships : [])
        .find((item) => item?.active !== false && cleanText(item?.tenantId || item?.tenant_id));
    return cleanText(membership?.tenantId || membership?.tenant_id || req.tenantContext?.id);
}

function canReadReports(req, tenantId, {
    accessPolicyService,
    isTenantAllowedForUser,
    hasAnyPermission,
    hasOperationsKpiReadAccess
} = {}) {
    if (typeof hasOperationsKpiReadAccess === 'function') {
        return hasOperationsKpiReadAccess(req, tenantId);
    }
    if (typeof isTenantAllowedForUser === 'function' && !isTenantAllowedForUser(req, tenantId)) {
        return false;
    }
    if (!accessPolicyService || typeof hasAnyPermission !== 'function') {
        return true;
    }
    return hasAnyPermission(req, [
        accessPolicyService.PERMISSIONS.TENANT_KPIS_READ,
        accessPolicyService.PERMISSIONS.TENANT_CONVERSATION_EVENTS_READ,
        accessPolicyService.PERMISSIONS.TENANT_CHAT_ASSIGNMENTS_READ,
        accessPolicyService.PERMISSIONS.TENANT_RUNTIME_READ
    ]);
}

function canReadTestContacts(req, tenantId, deps = {}) {
    if (canReadReports(req, tenantId, deps)) return true;
    const { accessPolicyService, hasAnyPermission } = deps;
    if (!accessPolicyService || typeof hasAnyPermission !== 'function') return true;
    return hasAnyPermission(req, [
        accessPolicyService.PERMISSIONS.TENANT_SETTINGS_READ,
        accessPolicyService.PERMISSIONS.TENANT_SETTINGS_MANAGE
    ].filter(Boolean));
}

function canManageTestContacts(req, tenantId, deps = {}) {
    const { accessPolicyService, isTenantAllowedForUser, hasAnyPermission } = deps;
    if (typeof isTenantAllowedForUser === 'function' && !isTenantAllowedForUser(req, tenantId)) {
        return false;
    }
    if (!accessPolicyService || typeof hasAnyPermission !== 'function') return true;
    return hasAnyPermission(req, [
        accessPolicyService.PERMISSIONS.TENANT_SETTINGS_MANAGE
    ].filter(Boolean));
}

function buildReportContext(req, res, deps = {}) {
    if (!ensureAuthenticated(req, res, deps.authService)) return null;
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
        res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        return null;
    }
    if (!canReadReports(req, tenantId, deps)) {
        res.status(403).json({ ok: false, error: 'No autorizado.' });
        return null;
    }
    const range = parseDateRange(req.query || {});
    return {
        tenantId,
        ...range,
        userId: nullableText(req.query?.userId),
        moduleId: nullableText(req.query?.moduleId)
    };
}

function buildReportAnalysisContext(req, res, deps = {}) {
    if (!ensureAuthenticated(req, res, deps.authService)) return null;
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
        res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        return null;
    }
    if (!canReadReports(req, tenantId, deps)) {
        res.status(403).json({ ok: false, error: 'No autorizado.' });
        return null;
    }
    const range = parseDateRange({ ...(req.query || {}), ...(req.body || {}) });
    return {
        tenantId,
        ...range,
        userId: nullableText(req.body?.userId || req.query?.userId),
        moduleId: nullableText(req.body?.moduleId || req.query?.moduleId),
        userLabel: nullableText(req.body?.userLabel),
        moduleLabel: nullableText(req.body?.moduleLabel),
        reportData: req.body?.reportData && typeof req.body.reportData === 'object'
            ? req.body.reportData
            : {}
    };
}

function reportParams(ctx = {}) {
    return [
        ctx.tenantId,
        ctx.dateFrom,
        ctx.dateTo,
        ctx.userId,
        ctx.moduleId
    ];
}

function assertPostgresReports() {
    if (getStorageDriver() !== 'postgres') {
        throw new Error('Los reportes operativos requieren SAAS_STORAGE_DRIVER=postgres.');
    }
}

async function listTestContacts(tenantId) {
    const { rows } = await queryPostgres(
        `SELECT phone_e164, label, added_at
           FROM tenant_test_contacts
          WHERE tenant_id = $1
          ORDER BY added_at DESC, label NULLS LAST, phone_e164`,
        [tenantId]
    );
    return rows.map((row) => ({
        phoneE164: row.phone_e164,
        label: row.label || '',
        addedAt: row.added_at || null
    }));
}

async function searchTestContactCandidates(tenantId, query = '') {
    const clean = cleanText(query);
    if (clean.length < 2) return [];
    const digits = normalizePhoneDigits(clean);
    const like = `%${clean.toLowerCase()}%`;
    const digitLike = digits ? `%${digits}%` : '';
    const { rows } = await queryPostgres(
        `WITH candidates AS (
            SELECT DISTINCT
                COALESCE(NULLIF(c.phone_e164, ''), NULLIF(c.phone_alt, '')) AS phone,
                COALESCE(
                    NULLIF(c.contact_name, ''),
                    NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name_paternal, c.last_name_maternal)), ''),
                    NULLIF(c.email, ''),
                    c.customer_id
                ) AS label,
                1 AS priority
              FROM tenant_customers c
             WHERE c.tenant_id = $1
               AND (
                    LOWER(CONCAT_WS(' ', c.contact_name, c.first_name, c.last_name_paternal, c.last_name_maternal, c.email, c.customer_id)) LIKE $2
                    OR ($3::text <> '' AND regexp_replace(COALESCE(c.phone_e164, c.phone_alt, ''), '[^0-9]', '', 'g') LIKE $3)
               )
            UNION ALL
            SELECT DISTINCT
                regexp_replace(split_part(ch.chat_id, '@', 1), '[^0-9]', '', 'g') AS phone,
                COALESCE(NULLIF(ch.display_name, ''), ch.chat_id) AS label,
                2 AS priority
              FROM tenant_chats ch
             WHERE ch.tenant_id = $1
               AND (
                    LOWER(COALESCE(ch.display_name, ch.chat_id, '')) LIKE $2
                    OR ($3::text <> '' AND regexp_replace(COALESCE(ch.chat_id, ''), '[^0-9]', '', 'g') LIKE $3)
               )
        )
        SELECT phone, label
          FROM candidates
         WHERE COALESCE(phone, '') <> ''
         ORDER BY priority, label NULLS LAST, phone
         LIMIT 12`,
        [tenantId, like, digitLike]
    );
    const seen = new Set();
    return rows.map((row) => ({
        phoneE164: normalizePhoneE164(row.phone),
        label: cleanText(row.label)
    })).filter((item) => {
        if (!item.phoneE164 || seen.has(item.phoneE164)) return false;
        seen.add(item.phoneE164);
        return true;
    });
}

async function upsertTestContact(tenantId, payload = {}) {
    const phoneE164 = normalizePhoneE164(payload.phone || payload.phoneE164 || payload.phone_e164);
    if (!phoneE164) throw new Error('Telefono invalido.');
    const label = nullableText(payload.label);
    const { rows } = await queryPostgres(
        `INSERT INTO tenant_test_contacts (tenant_id, phone_e164, label)
         VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, phone_e164)
         DO UPDATE SET label = EXCLUDED.label,
                       added_at = tenant_test_contacts.added_at
         RETURNING phone_e164, label, added_at`,
        [tenantId, phoneE164, label]
    );
    const row = rows[0] || {};
    return {
        phoneE164: row.phone_e164,
        label: row.label || '',
        addedAt: row.added_at || null
    };
}

async function deleteTestContact(tenantId, phone = '') {
    const phoneE164 = normalizePhoneE164(phone);
    if (!phoneE164) throw new Error('Telefono invalido.');
    await queryPostgres(
        `DELETE FROM tenant_test_contacts
          WHERE tenant_id = $1
            AND phone_e164 = $2`,
        [tenantId, phoneE164]
    );
    return phoneE164;
}

function toNumber(value = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function roundNumber(value = 0, digits = 2) {
    const number = toNumber(value);
    const factor = 10 ** digits;
    return Math.round(number * factor) / factor;
}

function toDateLabel(value = '') {
    if (typeof value === 'string' && DATE_PATTERN.test(value.slice(0, 10))) {
        return value.slice(0, 10);
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return cleanText(value);
    return date.toISOString().slice(0, 10);
}

function mapKpis(row = {}) {
    return {
        chatsNuevos: toNumber(row.chats_nuevos),
        chatsAtendidos: toNumber(row.chats_atendidos),
        cotizaciones: toNumber(row.cotizaciones),
        cotizacionesElegidas: toNumber(row.cotizaciones_elegidas),
        pedidosConfirmados: toNumber(row.pedidos_confirmados),
        pedidosAceptados: toNumber(row.pedidos_aceptados),
        pedidosProgramados: toNumber(row.pedidos_programados),
        pedidosAtendidos: toNumber(row.pedidos_atendidos),
        pedidosVendidos: toNumber(row.pedidos_vendidos),
        clientesConPedido: toNumber(row.clientes_con_pedido),
        ticketPromedio: roundNumber(row.ticket_promedio),
        revenueEstimado: roundNumber(row.revenue_estimado),
        ventasExternasMeta: roundNumber(row.ventas_externas_meta),
        revenueTotalMeta: roundNumber(row.revenue_total_meta),
        mensajesEnviados: toNumber(row.mensajes_enviados),
        mensajesRecibidos: toNumber(row.mensajes_recibidos),
        tiempoRespuestaPromedio: roundNumber(row.tiempo_respuesta_promedio),
        chatsActivos: toNumber(row.chats_activos),
        tasaConversion: roundNumber(row.tasa_conversion),
        inversionMeta: roundNumber(row.inversion_meta),
        roasMeta: roundNumber(row.roas_meta),
        roiMeta: roundNumber(row.roi_meta),
        costoPorPedido: roundNumber(row.costo_por_pedido)
    };
}

function makeZeroKpis() {
    return mapKpis({});
}

async function getReportKpis(ctx) {
    const sql = `
WITH period_days AS (
    SELECT (($3::date - $2::date) + 1)::int AS days
),
periods AS (
    SELECT
        'current'::text AS label,
        $2::date AS date_from,
        $3::date AS date_to,
        ($2::date::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}') AS starts_at,
        (($3::date + 1)::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}') AS ends_at
    UNION ALL
    SELECT
        'previous'::text AS label,
        ($2::date - (SELECT days FROM period_days))::date AS date_from,
        ($2::date - 1)::date AS date_to,
        (($2::date - (SELECT days FROM period_days))::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}') AS starts_at,
        ($2::date::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}') AS ends_at
),
${SCOPED_CHATS_CTE},
kpis AS (
    SELECT
        p.label,
        (
            SELECT COUNT(DISTINCT c.chat_id)
              FROM tenant_chats c
              JOIN scoped_chats sc ON sc.chat_id = c.chat_id
             WHERE c.tenant_id = $1
               AND c.created_at >= p.starts_at
               AND c.created_at < p.ends_at
        ) AS chats_nuevos,
        (
            SELECT COUNT(DISTINCT s.chat_id)
              FROM tenant_chat_commercial_status s
              JOIN scoped_chats sc ON sc.chat_id = s.chat_id
             WHERE s.tenant_id = $1
               AND s.first_agent_response_at IS NOT NULL
               AND s.first_agent_response_at >= p.starts_at
               AND s.first_agent_response_at < p.ends_at
               AND ($5::text IS NULL OR LOWER(COALESCE(s.scope_module_id, '')) = LOWER($5::text))
        ) AS chats_atendidos,
        (
            SELECT COUNT(DISTINCT q.quote_id)
              FROM tenant_quotes q
              JOIN scoped_chats sc ON sc.chat_id = q.chat_id
             WHERE q.tenant_id = $1
               AND q.created_at >= p.starts_at
               AND q.created_at < p.ends_at
               AND ($4::text IS NULL OR q.created_by_user_id = $4::text)
               AND ($5::text IS NULL OR LOWER(COALESCE(q.scope_module_id, '')) = LOWER($5::text))
        ) AS cotizaciones,
        (
            SELECT COUNT(DISTINCT o.order_id)
              FROM tenant_orders o
              JOIN scoped_chats sc ON sc.chat_id = o.chat_id
             WHERE o.tenant_id = $1
               AND o.created_at >= p.starts_at
               AND o.created_at < p.ends_at
               AND o.status IN ${ORDER_REVENUE_STATUSES_SQL}
               AND ($4::text IS NULL OR o.created_by_user_id = $4::text OR o.assigned_user_id = $4::text)
               AND ($5::text IS NULL OR LOWER(COALESCE(o.scope_module_id, '')) = LOWER($5::text))
        ) AS cotizaciones_elegidas,
        (
            SELECT COUNT(DISTINCT o.order_id)
              FROM tenant_orders o
              JOIN scoped_chats sc ON sc.chat_id = o.chat_id
             WHERE o.tenant_id = $1
               AND o.created_at >= p.starts_at
               AND o.created_at < p.ends_at
               AND o.status IN ${ORDER_REVENUE_STATUSES_SQL}
               AND ($4::text IS NULL OR o.created_by_user_id = $4::text OR o.assigned_user_id = $4::text)
               AND ($5::text IS NULL OR LOWER(COALESCE(o.scope_module_id, '')) = LOWER($5::text))
        ) AS pedidos_confirmados,
        (
            SELECT COUNT(DISTINCT o.order_id)
              FROM tenant_orders o
              JOIN scoped_chats sc ON sc.chat_id = o.chat_id
             WHERE o.tenant_id = $1
               AND o.created_at >= p.starts_at
               AND o.created_at < p.ends_at
               AND o.status = 'aceptado'
               AND ($4::text IS NULL OR o.created_by_user_id = $4::text OR o.assigned_user_id = $4::text)
               AND ($5::text IS NULL OR LOWER(COALESCE(o.scope_module_id, '')) = LOWER($5::text))
        ) AS pedidos_aceptados,
        (
            SELECT COUNT(DISTINCT o.order_id)
              FROM tenant_orders o
              JOIN scoped_chats sc ON sc.chat_id = o.chat_id
             WHERE o.tenant_id = $1
               AND o.created_at >= p.starts_at
               AND o.created_at < p.ends_at
               AND o.status = 'programado'
               AND ($4::text IS NULL OR o.created_by_user_id = $4::text OR o.assigned_user_id = $4::text)
               AND ($5::text IS NULL OR LOWER(COALESCE(o.scope_module_id, '')) = LOWER($5::text))
        ) AS pedidos_programados,
        (
            SELECT COUNT(DISTINCT o.order_id)
              FROM tenant_orders o
              JOIN scoped_chats sc ON sc.chat_id = o.chat_id
             WHERE o.tenant_id = $1
               AND o.created_at >= p.starts_at
               AND o.created_at < p.ends_at
               AND o.status = 'atendido'
               AND ($4::text IS NULL OR o.created_by_user_id = $4::text OR o.assigned_user_id = $4::text)
               AND ($5::text IS NULL OR LOWER(COALESCE(o.scope_module_id, '')) = LOWER($5::text))
        ) AS pedidos_atendidos,
        (
            SELECT COUNT(DISTINCT o.order_id)
              FROM tenant_orders o
              JOIN scoped_chats sc ON sc.chat_id = o.chat_id
             WHERE o.tenant_id = $1
               AND o.created_at >= p.starts_at
               AND o.created_at < p.ends_at
               AND o.status = 'vendido'
               AND ($4::text IS NULL OR o.created_by_user_id = $4::text OR o.assigned_user_id = $4::text)
               AND ($5::text IS NULL OR LOWER(COALESCE(o.scope_module_id, '')) = LOWER($5::text))
        ) AS pedidos_vendidos,
        (
            SELECT COUNT(*)
              FROM (
                SELECT COALESCE(NULLIF(o.customer_id, ''), o.chat_id) AS customer_key
                  FROM tenant_orders o
                  JOIN scoped_chats sc ON sc.chat_id = o.chat_id
                 WHERE o.tenant_id = $1
                   AND o.created_at >= p.starts_at
                   AND o.created_at < p.ends_at
                   AND o.status IN ${ORDER_REVENUE_STATUSES_SQL}
                   AND ($4::text IS NULL OR o.created_by_user_id = $4::text OR o.assigned_user_id = $4::text)
                   AND ($5::text IS NULL OR LOWER(COALESCE(o.scope_module_id, '')) = LOWER($5::text))
                 GROUP BY COALESCE(NULLIF(o.customer_id, ''), o.chat_id)
              ) order_customers
        ) AS clientes_con_pedido,
        (
            SELECT AVG(customer_total)
              FROM (
                SELECT COALESCE(NULLIF(o.customer_id, ''), o.chat_id) AS customer_key,
                       SUM(COALESCE(o.total_amount, 0)) AS customer_total
                  FROM tenant_orders o
                  JOIN scoped_chats sc ON sc.chat_id = o.chat_id
                 WHERE o.tenant_id = $1
                   AND o.created_at >= p.starts_at
                   AND o.created_at < p.ends_at
                   AND o.status IN ${ORDER_REVENUE_STATUSES_SQL}
                   AND ($4::text IS NULL OR o.created_by_user_id = $4::text OR o.assigned_user_id = $4::text)
                   AND ($5::text IS NULL OR LOWER(COALESCE(o.scope_module_id, '')) = LOWER($5::text))
                 GROUP BY COALESCE(NULLIF(o.customer_id, ''), o.chat_id)
              ) order_totals
        ) AS ticket_promedio,
        (
            SELECT SUM(customer_total)
              FROM (
                SELECT COALESCE(NULLIF(o.customer_id, ''), o.chat_id) AS customer_key,
                       SUM(COALESCE(o.total_amount, 0)) AS customer_total
                  FROM tenant_orders o
                  JOIN scoped_chats sc ON sc.chat_id = o.chat_id
                 WHERE o.tenant_id = $1
                   AND o.created_at >= p.starts_at
                   AND o.created_at < p.ends_at
                   AND o.status IN ${ORDER_REVENUE_STATUSES_SQL}
                   AND ($4::text IS NULL OR o.created_by_user_id = $4::text OR o.assigned_user_id = $4::text)
                   AND ($5::text IS NULL OR LOWER(COALESCE(o.scope_module_id, '')) = LOWER($5::text))
                 GROUP BY COALESCE(NULLIF(o.customer_id, ''), o.chat_id)
              ) order_totals
        ) AS revenue_estimado,
        (
            SELECT COALESCE(SUM(COALESCE(i.spend, 0)), 0)
              FROM tenant_meta_ads_insights i
             WHERE i.tenant_id = $1
               AND i.object_type = 'ad'
               AND i.date_start >= p.date_from
               AND i.date_stop <= p.date_to
        ) AS inversion_meta,
        (
            SELECT COALESCE(SUM(COALESCE(es.amount, 0)), 0)
              FROM tenant_meta_ads_external_sales es
             WHERE es.tenant_id = $1
               AND es.sale_date >= p.date_from
               AND es.sale_date <= p.date_to
               AND NOT EXISTS (
                    SELECT 1
                      FROM tenant_test_contacts tc
                     WHERE tc.tenant_id = es.tenant_id
                       AND regexp_replace(COALESCE(es.phone, ''), '[^0-9]', '', 'g')
                           LIKE '%' || regexp_replace(COALESCE(tc.phone_e164, ''), '[^0-9]', '', 'g') || '%'
               )
        ) AS ventas_externas_meta,
        (
            SELECT COUNT(DISTINCT es.sale_id)
              FROM tenant_meta_ads_external_sales es
             WHERE es.tenant_id = $1
               AND es.sale_date >= p.date_from
               AND es.sale_date <= p.date_to
               AND NOT EXISTS (
                    SELECT 1
                      FROM tenant_test_contacts tc
                     WHERE tc.tenant_id = es.tenant_id
                       AND regexp_replace(COALESCE(es.phone, ''), '[^0-9]', '', 'g')
                           LIKE '%' || regexp_replace(COALESCE(tc.phone_e164, ''), '[^0-9]', '', 'g') || '%'
               )
        ) AS pedidos_externos_meta,
        (
            SELECT COUNT(*)
              FROM tenant_messages m
              JOIN scoped_chats sc ON sc.chat_id = m.chat_id
             WHERE m.tenant_id = $1
               AND m.from_me = true
               AND m.created_at >= p.starts_at
               AND m.created_at < p.ends_at
               AND ($4::text IS NULL OR ${SENT_BY_USER_SQL} = $4::text)
               AND ($5::text IS NULL OR ${MESSAGE_MODULE_SQL} = LOWER($5::text))
        ) AS mensajes_enviados,
        (
            SELECT COUNT(*)
              FROM tenant_messages m
              JOIN scoped_chats sc ON sc.chat_id = m.chat_id
             WHERE m.tenant_id = $1
               AND m.from_me = false
               AND m.created_at >= p.starts_at
               AND m.created_at < p.ends_at
               AND ($5::text IS NULL OR ${MESSAGE_MODULE_SQL} = LOWER($5::text))
        ) AS mensajes_recibidos,
        (
            SELECT AVG(EXTRACT(EPOCH FROM (s.first_agent_response_at - s.first_customer_message_at)) / 60)
              FROM tenant_chat_commercial_status s
              JOIN scoped_chats sc ON sc.chat_id = s.chat_id
             WHERE s.tenant_id = $1
               AND s.first_customer_message_at IS NOT NULL
               AND s.first_agent_response_at IS NOT NULL
               AND s.first_agent_response_at >= p.starts_at
               AND s.first_agent_response_at < p.ends_at
               AND ($5::text IS NULL OR LOWER(COALESCE(s.scope_module_id, '')) = LOWER($5::text))
        ) AS tiempo_respuesta_promedio,
        (
            SELECT COUNT(DISTINCT c.chat_id)
              FROM tenant_chats c
              JOIN scoped_chats sc ON sc.chat_id = c.chat_id
             WHERE c.tenant_id = $1
               AND to_timestamp(c.last_message_at) >= NOW() - INTERVAL '24 hours'
        ) AS chats_activos
      FROM periods p
)
SELECT
    label,
    chats_nuevos,
    chats_atendidos,
    cotizaciones,
    cotizaciones_elegidas,
    pedidos_confirmados,
    pedidos_aceptados,
    pedidos_programados,
    pedidos_atendidos,
    pedidos_vendidos,
    clientes_con_pedido,
    COALESCE(ticket_promedio, 0) AS ticket_promedio,
    COALESCE(revenue_estimado, 0) AS revenue_estimado,
    COALESCE(ventas_externas_meta, 0) AS ventas_externas_meta,
    COALESCE(revenue_estimado, 0) + COALESCE(ventas_externas_meta, 0) AS revenue_total_meta,
    COALESCE(inversion_meta, 0) AS inversion_meta,
    CASE WHEN COALESCE(inversion_meta, 0) > 0
        THEN ROUND(((COALESCE(revenue_estimado, 0) + COALESCE(ventas_externas_meta, 0))::numeric / inversion_meta::numeric), 2)
        ELSE 0
    END AS roas_meta,
    CASE WHEN COALESCE(inversion_meta, 0) > 0
        THEN ROUND((((COALESCE(revenue_estimado, 0) + COALESCE(ventas_externas_meta, 0))::numeric - inversion_meta::numeric) / inversion_meta::numeric) * 100, 2)
        ELSE 0
    END AS roi_meta,
    CASE WHEN (pedidos_confirmados + COALESCE(pedidos_externos_meta, 0)) > 0
        THEN ROUND((COALESCE(inversion_meta, 0)::numeric / (pedidos_confirmados + COALESCE(pedidos_externos_meta, 0))::numeric), 2)
        ELSE 0
    END AS costo_por_pedido,
    mensajes_enviados,
    mensajes_recibidos,
    COALESCE(tiempo_respuesta_promedio, 0) AS tiempo_respuesta_promedio,
    chats_activos,
    CASE WHEN chats_nuevos > 0
        THEN ROUND((clientes_con_pedido::numeric / chats_nuevos::numeric) * 100, 2)
        ELSE 0
    END AS tasa_conversion
  FROM kpis`;

    const { rows } = await queryPostgres(sql, reportParams(ctx));
    const current = rows.find((row) => row.label === 'current') || {};
    const previous = rows.find((row) => row.label === 'previous') || {};
    return {
        ...mapKpis(current),
        kpisPeriodoAnterior: rows.length ? mapKpis(previous) : makeZeroKpis()
    };
}

async function getReportFunnel(ctx) {
    const sql = `
WITH bounds AS (
    SELECT
        ($2::date::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}') AS starts_at,
        (($3::date + 1)::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}') AS ends_at
),
days AS (
    SELECT generate_series($2::date, $3::date, INTERVAL '1 day')::date AS day
),
${SCOPED_CHATS_CTE},
status_rows AS (
    SELECT
        s.chat_id,
        s.status,
        COALESCE(s.last_transition_at, s.updated_at, s.created_at) AS transition_at,
        DATE(COALESCE(s.last_transition_at, s.updated_at, s.created_at) AT TIME ZONE '${REPORT_TIME_ZONE}') AS day
      FROM tenant_chat_commercial_status s
      JOIN scoped_chats sc ON sc.chat_id = s.chat_id
      CROSS JOIN bounds b
     WHERE s.tenant_id = $1
       AND COALESCE(s.last_transition_at, s.updated_at, s.created_at) >= b.starts_at
       AND COALESCE(s.last_transition_at, s.updated_at, s.created_at) < b.ends_at
       AND ($5::text IS NULL OR LOWER(COALESCE(s.scope_module_id, '')) = LOWER($5::text))
),
counts AS (
    SELECT status, COUNT(DISTINCT chat_id) AS total
      FROM status_rows
     GROUP BY status
),
daily AS (
    SELECT
        d.day,
        COUNT(DISTINCT sr.chat_id) FILTER (WHERE sr.status = 'nuevo') AS nuevo,
        COUNT(DISTINCT sr.chat_id) FILTER (WHERE sr.status = 'en_conversacion') AS en_conversacion,
        COUNT(DISTINCT sr.chat_id) FILTER (WHERE sr.status = 'cotizado') AS cotizado,
        COUNT(DISTINCT sr.chat_id) FILTER (WHERE sr.status = 'aceptado') AS aceptado,
        COUNT(DISTINCT sr.chat_id) FILTER (WHERE sr.status = 'programado') AS programado,
        COUNT(DISTINCT sr.chat_id) FILTER (WHERE sr.status = 'atendido') AS atendido,
        COUNT(DISTINCT sr.chat_id) FILTER (WHERE sr.status = 'vendido') AS vendido,
        COUNT(DISTINCT sr.chat_id) FILTER (WHERE sr.status = 'perdido') AS perdido,
        COUNT(DISTINCT sr.chat_id) FILTER (WHERE sr.status = 'expirado') AS expirado
      FROM days d
      LEFT JOIN status_rows sr ON sr.day = d.day
     GROUP BY d.day
     ORDER BY d.day
)
SELECT
    COALESCE((SELECT total FROM counts WHERE status = 'nuevo'), 0) AS nuevo,
    COALESCE((SELECT total FROM counts WHERE status = 'en_conversacion'), 0) AS en_conversacion,
    COALESCE((SELECT total FROM counts WHERE status = 'cotizado'), 0) AS cotizado,
    COALESCE((SELECT total FROM counts WHERE status = 'aceptado'), 0) AS aceptado,
    COALESCE((SELECT total FROM counts WHERE status = 'programado'), 0) AS programado,
    COALESCE((SELECT total FROM counts WHERE status = 'atendido'), 0) AS atendido,
    COALESCE((SELECT total FROM counts WHERE status = 'vendido'), 0) AS vendido,
    COALESCE((SELECT total FROM counts WHERE status = 'perdido'), 0) AS perdido,
    COALESCE((SELECT total FROM counts WHERE status = 'expirado'), 0) AS expirado,
    COALESCE(
        (
            SELECT json_agg(
                json_build_object(
                    'date', day,
                    'nuevo', nuevo,
                    'enConversacion', en_conversacion,
                    'cotizado', cotizado,
                    'aceptado', aceptado,
                    'programado', programado,
                    'atendido', atendido,
                    'vendido', vendido,
                    'perdido', perdido,
                    'expirado', expirado
                )
                ORDER BY day
            )
              FROM daily
        ),
        '[]'::json
    ) AS por_dia`;

    const { rows } = await queryPostgres(sql, reportParams(ctx));
    const row = rows[0] || {};
    const nuevo = toNumber(row.nuevo);
    const enConversacion = toNumber(row.en_conversacion);
    const cotizado = toNumber(row.cotizado);
    const aceptado = toNumber(row.aceptado);
    const programado = toNumber(row.programado);
    const atendido = toNumber(row.atendido);
    const vendido = toNumber(row.vendido);
    const perdido = toNumber(row.perdido);
    const expirado = toNumber(row.expirado);
    return {
        nuevo,
        enConversacion,
        cotizado,
        aceptado,
        programado,
        atendido,
        vendido,
        perdido,
        expirado,
        tasaAceptacion: cotizado > 0 ? roundNumber((aceptado / cotizado) * 100) : 0,
        tasaProgresion: aceptado > 0 ? roundNumber((atendido / aceptado) * 100) : 0,
        proyeccionVentas: programado + atendido + vendido,
        fugaCotizadoAceptado: Math.max(0, cotizado - aceptado - perdido),
        fugaAceptadoProgramado: Math.max(0, aceptado - programado - perdido),
        fugaAceptadoAtendido: Math.max(0, aceptado - atendido - perdido),
        porDia: Array.isArray(row.por_dia) ? row.por_dia : []
    };
}

async function getReportTeam(ctx) {
    const sql = `
WITH bounds AS (
    SELECT
        ($2::date::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}') AS starts_at,
        (($3::date + 1)::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}') AS ends_at
),
tenant_users AS (
    SELECT
        u.user_id,
        COALESCE(NULLIF(u.display_name, ''), u.email, u.user_id) AS display_name,
        u.avatar_url,
        m.role
      FROM memberships m
      JOIN users u ON u.user_id = m.user_id
     WHERE m.tenant_id = $1
       AND m.is_active = true
       AND u.is_active = true
       AND ($4::text IS NULL OR u.user_id = $4::text)
),
hours AS (
    SELECT generate_series(0, 23) AS hour
),
${SCOPED_CHATS_CTE},
user_activity AS (
    SELECT
        tu.user_id,
        h.hour,
        COUNT(msg.message_id) AS mensajes
      FROM tenant_users tu
      CROSS JOIN hours h
      LEFT JOIN tenant_messages msg
        ON msg.tenant_id = $1
       AND msg.from_me = true
       AND ${SENT_BY_USER_SQL.replaceAll('m.', 'msg.')} = tu.user_id
       AND EXTRACT(HOUR FROM msg.created_at AT TIME ZONE '${REPORT_TIME_ZONE}')::int = h.hour
       AND msg.created_at >= (SELECT starts_at FROM bounds)
       AND msg.created_at < (SELECT ends_at FROM bounds)
       AND ($5::text IS NULL OR ${MESSAGE_MODULE_SQL.replaceAll('m.', 'msg.')} = LOWER($5::text))
       AND EXISTS (SELECT 1 FROM scoped_chats sc WHERE sc.chat_id = msg.chat_id)
     GROUP BY tu.user_id, h.hour
)
SELECT
    tu.user_id,
    tu.display_name,
    tu.avatar_url,
    tu.role,
    COALESCE((
        SELECT COUNT(DISTINCT a.chat_id)
          FROM tenant_chat_assignments a
          JOIN scoped_chats sc ON sc.chat_id = a.chat_id
         WHERE a.tenant_id = $1
           AND a.assignee_user_id = tu.user_id
           AND COALESCE(a.status, 'active') <> 'inactive'
           AND ($5::text IS NULL OR LOWER(COALESCE(a.scope_module_id, '')) = LOWER($5::text))
    ), 0) AS chats_asignados,
    COALESCE((
        SELECT COUNT(DISTINCT s.chat_id)
          FROM tenant_chat_commercial_status s
          JOIN scoped_chats sc ON sc.chat_id = s.chat_id
          JOIN tenant_chat_assignments a
            ON a.tenant_id = s.tenant_id
           AND a.chat_id = s.chat_id
           AND a.assignee_user_id = tu.user_id
         WHERE s.tenant_id = $1
           AND s.first_agent_response_at IS NOT NULL
           AND s.first_agent_response_at >= (SELECT starts_at FROM bounds)
           AND s.first_agent_response_at < (SELECT ends_at FROM bounds)
           AND ($5::text IS NULL OR LOWER(COALESCE(s.scope_module_id, a.scope_module_id, '')) = LOWER($5::text))
    ), 0) AS chats_atendidos,
    COALESCE((
        SELECT COUNT(DISTINCT q.quote_id)
          FROM tenant_quotes q
          JOIN scoped_chats sc ON sc.chat_id = q.chat_id
         WHERE q.tenant_id = $1
           AND q.created_by_user_id = tu.user_id
           AND q.created_at >= (SELECT starts_at FROM bounds)
           AND q.created_at < (SELECT ends_at FROM bounds)
           AND ($5::text IS NULL OR LOWER(COALESCE(q.scope_module_id, '')) = LOWER($5::text))
    ), 0) AS cotizaciones,
    COALESCE((
        SELECT COUNT(DISTINCT o.order_id)
          FROM tenant_orders o
          JOIN scoped_chats sc ON sc.chat_id = o.chat_id
         WHERE o.tenant_id = $1
           AND (o.created_by_user_id = tu.user_id OR o.assigned_user_id = tu.user_id)
           AND o.status IN ${ORDER_REVENUE_STATUSES_SQL}
           AND o.created_at >= (SELECT starts_at FROM bounds)
           AND o.created_at < (SELECT ends_at FROM bounds)
           AND ($5::text IS NULL OR LOWER(COALESCE(o.scope_module_id, '')) = LOWER($5::text))
    ), 0) AS ventas,
    COALESCE((
        SELECT COUNT(*)
          FROM tenant_messages m
          JOIN scoped_chats sc ON sc.chat_id = m.chat_id
         WHERE m.tenant_id = $1
           AND m.from_me = true
           AND ${SENT_BY_USER_SQL} = tu.user_id
           AND m.created_at >= (SELECT starts_at FROM bounds)
           AND m.created_at < (SELECT ends_at FROM bounds)
           AND ($5::text IS NULL OR ${MESSAGE_MODULE_SQL} = LOWER($5::text))
    ), 0) AS mensajes_enviados,
    COALESCE((
        SELECT AVG(EXTRACT(EPOCH FROM (s.first_agent_response_at - s.first_customer_message_at)) / 60)
          FROM tenant_chat_commercial_status s
          JOIN scoped_chats sc ON sc.chat_id = s.chat_id
          JOIN tenant_chat_assignments a
            ON a.tenant_id = s.tenant_id
           AND a.chat_id = s.chat_id
           AND a.assignee_user_id = tu.user_id
         WHERE s.tenant_id = $1
           AND s.first_customer_message_at IS NOT NULL
           AND s.first_agent_response_at IS NOT NULL
           AND s.first_agent_response_at >= (SELECT starts_at FROM bounds)
           AND s.first_agent_response_at < (SELECT ends_at FROM bounds)
           AND ($5::text IS NULL OR LOWER(COALESCE(s.scope_module_id, a.scope_module_id, '')) = LOWER($5::text))
    ), 0) AS tiempo_respuesta,
    COALESCE((
        SELECT json_agg(
            json_build_object('hora', ua.hour, 'mensajes', ua.mensajes)
            ORDER BY ua.hour
        )
          FROM user_activity ua
         WHERE ua.user_id = tu.user_id
    ), '[]'::json) AS actividad_por_hora
  FROM tenant_users tu
 ORDER BY mensajes_enviados DESC, chats_atendidos DESC, tu.display_name`;

    const { rows } = await queryPostgres(sql, reportParams(ctx));
    return rows.map((row) => {
        const chatsAtendidos = toNumber(row.chats_atendidos);
        const ventas = toNumber(row.ventas);
        return {
            userId: row.user_id,
            displayName: row.display_name,
            avatarUrl: row.avatar_url || null,
            role: row.role || 'seller',
            chatsAsignados: toNumber(row.chats_asignados),
            chatsAtendidos,
            cotizaciones: toNumber(row.cotizaciones),
            ventas,
            mensajesEnviados: toNumber(row.mensajes_enviados),
            tiempoRespuesta: roundNumber(row.tiempo_respuesta),
            tasaConversion: chatsAtendidos > 0 ? roundNumber((ventas / chatsAtendidos) * 100) : 0,
            actividadPorHora: Array.isArray(row.actividad_por_hora) ? row.actividad_por_hora : []
        };
    });
}

async function getReportOrigins(ctx) {
    const sql = `
WITH bounds AS (
    SELECT
        ($2::date::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}') AS starts_at,
        (($3::date + 1)::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}') AS ends_at
),
${SCOPED_CHATS_CTE},
origins AS (
    SELECT o.*
      FROM tenant_chat_origins o
      JOIN scoped_chats sc ON sc.chat_id = o.chat_id
     WHERE o.tenant_id = $1
       AND ($5::text IS NULL OR LOWER(COALESCE(o.scope_module_id, '')) = LOWER($5::text))
),
origins_period AS (
    SELECT o.*
      FROM origins o
      CROSS JOIN bounds b
     WHERE COALESCE(o.detected_at, o.created_at) >= b.starts_at
       AND COALESCE(o.detected_at, o.created_at) < b.ends_at
),
quotes_by_chat AS (
    SELECT
        q.chat_id,
        COUNT(DISTINCT q.quote_id) AS quote_count
      FROM tenant_quotes q
      JOIN scoped_chats sc ON sc.chat_id = q.chat_id
      CROSS JOIN bounds b
     WHERE q.tenant_id = $1
       AND q.created_at >= b.starts_at
       AND q.created_at < b.ends_at
       AND ($4::text IS NULL OR q.created_by_user_id = $4::text)
       AND ($5::text IS NULL OR LOWER(COALESCE(q.scope_module_id, '')) = LOWER($5::text))
     GROUP BY q.chat_id
),
orders_in_period AS (
    SELECT
        ord.order_id,
        ord.chat_id,
        COALESCE(NULLIF(ord.customer_id, ''), ord.chat_id) AS customer_key,
        ord.status,
        COALESCE(ord.total_amount, 0) AS total_amount,
        ord.source_type,
        ord.source_id,
        ord.created_at,
        COALESCE(NULLIF(ch.display_name, ''), ord.chat_id) AS chat_label
      FROM tenant_orders ord
      JOIN scoped_chats sc ON sc.chat_id = ord.chat_id
      LEFT JOIN tenant_chats ch
        ON ch.tenant_id = ord.tenant_id
       AND ch.chat_id = ord.chat_id
      CROSS JOIN bounds b
     WHERE ord.tenant_id = $1
       AND ord.created_at >= b.starts_at
       AND ord.created_at < b.ends_at
       AND ord.status IN ${ORDER_REVENUE_STATUSES_SQL}
       AND ($4::text IS NULL OR ord.created_by_user_id = $4::text OR ord.assigned_user_id = $4::text)
       AND ($5::text IS NULL OR LOWER(COALESCE(ord.scope_module_id, '')) = LOWER($5::text))
),
orders_by_chat AS (
    SELECT
        chat_id,
        COUNT(DISTINCT order_id) AS order_count,
        COUNT(DISTINCT customer_key) AS customer_count,
        SUM(total_amount) AS revenue,
        json_agg(
            json_build_object(
                'orderId', order_id,
                'chatId', chat_id,
                'chatLabel', chat_label,
                'status', status,
                'total', total_amount,
                'sourceType', source_type,
                'sourceId', source_id,
                'createdAt', created_at
            )
            ORDER BY created_at DESC
        ) AS orders_json
      FROM orders_in_period
     GROUP BY chat_id
),
source_rows AS (
    SELECT
        COALESCE(NULLIF(o.origin_source, ''), o.origin_type, 'unknown') AS source,
        COALESCE(
            NULLIF(o.origin_label, ''),
            NULLIF(o.origin_detail::text, 'null'),
            NULLIF(o.referral_headline, ''),
            o.origin_source,
            o.origin_type,
            'Sin origen'
        ) AS label,
        COUNT(DISTINCT o.chat_id) AS total,
        SUM(COALESCE(qb.quote_count, 0)) AS cotizaciones,
        SUM(COALESCE(ob.order_count, 0)) AS pedidos,
        SUM(COALESCE(ob.revenue, 0)) AS revenue
      FROM origins_period o
      LEFT JOIN quotes_by_chat qb ON qb.chat_id = o.chat_id
      LEFT JOIN orders_by_chat ob ON ob.chat_id = o.chat_id
     GROUP BY 1, 2
),
ad_origins_all AS (
    SELECT DISTINCT
        o.chat_id,
        o.referral_source_id AS ad_id,
        o.referral_headline,
        o.campaign_id,
        o.referral_source_url
      FROM origins o
     WHERE COALESCE(o.referral_source_id, '') <> ''
       AND (
            COALESCE(o.origin_source, o.origin_type, '') IN ('meta_ad', 'ad', 'meta')
            OR o.origin_type = 'meta_ad'
       )
),
ad_chats_period AS (
    SELECT
        o.referral_source_id AS ad_id,
        COUNT(DISTINCT o.chat_id) AS chats,
        MAX(NULLIF(o.referral_source_url, '')) AS referral_source_url
      FROM origins_period o
     WHERE COALESCE(o.referral_source_id, '') <> ''
       AND (
            COALESCE(o.origin_source, o.origin_type, '') IN ('meta_ad', 'ad', 'meta')
            OR o.origin_type = 'meta_ad'
       )
     GROUP BY o.referral_source_id
),
ad_quotes AS (
    SELECT
        ao.ad_id,
        SUM(COALESCE(qb.quote_count, 0)) AS cotizaciones
      FROM ad_origins_all ao
      JOIN quotes_by_chat qb ON qb.chat_id = ao.chat_id
     GROUP BY ao.ad_id
),
ad_orders AS (
    SELECT
        ao.ad_id,
        COUNT(DISTINCT oi.order_id) AS pedidos,
        COUNT(DISTINCT oi.customer_key) AS clientes_con_pedido,
        SUM(oi.total_amount) AS revenue,
        jsonb_agg(
            jsonb_build_object(
                'orderId', oi.order_id,
                'chatId', oi.chat_id,
                'chatLabel', oi.chat_label,
                'status', oi.status,
                'total', oi.total_amount,
                'sourceType', oi.source_type,
                'sourceId', oi.source_id,
                'createdAt', oi.created_at
            )
            ORDER BY oi.created_at DESC
        ) AS orders_json
      FROM ad_origins_all ao
      JOIN orders_in_period oi ON oi.chat_id = ao.chat_id
     GROUP BY ao.ad_id
),
external_sales AS (
    SELECT
        es.ad_id,
        COUNT(DISTINCT es.sale_id) AS pedidos_externos,
        SUM(COALESCE(es.amount, 0)) AS revenue_externo,
        jsonb_agg(
            jsonb_build_object(
                'orderId', es.sale_id,
                'saleId', es.sale_id,
                'chatId', NULL,
                'chatLabel', COALESCE(NULLIF(es.phone, ''), 'Venta externa'),
                'status', 'externo',
                'total', COALESCE(es.amount, 0),
                'sourceType', 'external',
                'sourceId', es.ad_id,
                'detail', es.detail,
                'createdAt', es.sale_date
            )
            ORDER BY es.sale_date DESC, es.created_at DESC
        ) AS external_orders_json
      FROM tenant_meta_ads_external_sales es
     WHERE es.tenant_id = $1
       AND es.sale_date >= $2::date
       AND es.sale_date <= $3::date
       AND NOT EXISTS (
            SELECT 1
              FROM tenant_test_contacts tc
             WHERE tc.tenant_id = es.tenant_id
               AND regexp_replace(COALESCE(es.phone, ''), '[^0-9]', '', 'g')
                   LIKE '%' || regexp_replace(COALESCE(tc.phone_e164, ''), '[^0-9]', '', 'g') || '%'
       )
     GROUP BY es.ad_id
),
ad_spend AS (
    SELECT
        i.object_id AS ad_id,
        SUM(COALESCE(i.spend, 0)) AS spend
      FROM tenant_meta_ads_insights i
     WHERE i.tenant_id = $1
       AND i.object_type = 'ad'
       AND i.date_start >= $2::date
       AND i.date_stop <= $3::date
     GROUP BY i.object_id
),
ad_ids AS (
    SELECT ad_id FROM ad_chats_period
    UNION
    SELECT ad_id FROM ad_quotes
    UNION
    SELECT ad_id FROM ad_orders
    UNION
    SELECT ad_id FROM external_sales
    UNION
    SELECT ad_id FROM ad_spend
),
ad_rows AS (
    SELECT
        ids.ad_id,
        COALESCE(ad.object_name, MAX(ao.referral_headline), ids.ad_id) AS ad_name,
        COALESCE(adset.object_id, '') AS adset_id,
        COALESCE(adset.object_name, '') AS adset_name,
        COALESCE(campaign.object_id, MAX(NULLIF(ao.campaign_id, '')), '') AS campaign_id,
        COALESCE(campaign.object_name, MAX(NULLIF(ao.campaign_id, '')), 'Sin campana') AS campaign_name,
        COALESCE(ad.status, '') AS ad_status,
        COALESCE(acp.chats, 0) AS chats,
        COALESCE(aq.cotizaciones, 0) AS cotizaciones,
        COALESCE(aoo.pedidos, 0) AS pedidos_sistema,
        COALESCE(es.pedidos_externos, 0) AS pedidos_externos,
        COALESCE(aoo.pedidos, 0) + COALESCE(es.pedidos_externos, 0) AS pedidos,
        COALESCE(aoo.clientes_con_pedido, 0) AS clientes_con_pedido,
        COALESCE(aoo.revenue, 0) AS revenue_sistema,
        COALESCE(es.revenue_externo, 0) AS revenue_externo,
        COALESCE(aoo.revenue, 0) + COALESCE(es.revenue_externo, 0) AS revenue,
        COALESCE(sp.spend, 0) AS inversion,
        COALESCE(acp.referral_source_url, MAX(NULLIF(ao.referral_source_url, ''))) AS referral_source_url,
        COALESCE(aoo.orders_json, '[]'::jsonb) || COALESCE(es.external_orders_json, '[]'::jsonb) AS orders_json
      FROM ad_ids ids
      LEFT JOIN ad_origins_all ao ON ao.ad_id = ids.ad_id
      LEFT JOIN tenant_meta_ads_structure ad
        ON ad.tenant_id = $1
       AND ad.object_id = ids.ad_id
       AND ad.object_type = 'ad'
      LEFT JOIN tenant_meta_ads_structure adset
        ON adset.tenant_id = $1
       AND adset.object_id = ad.parent_id
       AND adset.object_type = 'adset'
      LEFT JOIN tenant_meta_ads_structure campaign
        ON campaign.tenant_id = $1
       AND campaign.object_id = COALESCE(NULLIF(ao.campaign_id, ''), adset.parent_id)
       AND campaign.object_type = 'campaign'
      LEFT JOIN ad_chats_period acp ON acp.ad_id = ids.ad_id
      LEFT JOIN ad_quotes aq ON aq.ad_id = ids.ad_id
      LEFT JOIN ad_orders aoo ON aoo.ad_id = ids.ad_id
      LEFT JOIN external_sales es ON es.ad_id = ids.ad_id
      LEFT JOIN ad_spend sp ON sp.ad_id = ids.ad_id
     GROUP BY ids.ad_id, ad.object_name, ad.status, adset.object_id, adset.object_name,
              campaign.object_id, campaign.object_name, acp.chats, acp.referral_source_url,
              aq.cotizaciones, aoo.pedidos, aoo.clientes_con_pedido, aoo.revenue,
              aoo.orders_json, es.pedidos_externos, es.revenue_externo,
              es.external_orders_json, sp.spend
),
campaign_rows AS (
    SELECT
        COALESCE(NULLIF(campaign_id, ''), 'sin_campaign') AS campaign_id,
        COALESCE(NULLIF(campaign_name, ''), 'Sin campana') AS campaign_name,
        COUNT(DISTINCT ad_id) AS ads,
        SUM(chats) AS chats,
        SUM(cotizaciones) AS cotizaciones,
        SUM(pedidos) AS pedidos,
        SUM(pedidos_sistema) AS pedidos_sistema,
        SUM(pedidos_externos) AS pedidos_externos,
        SUM(clientes_con_pedido) AS clientes_con_pedido,
        SUM(revenue) AS revenue,
        SUM(revenue_sistema) AS revenue_sistema,
        SUM(revenue_externo) AS revenue_externo,
        SUM(inversion) AS inversion,
        json_agg(
            json_build_object(
                'adId', ad_id,
                'adName', ad_name,
                'adsetName', adset_name,
                'chats', chats,
                'pedidos', pedidos,
                'pedidosSistema', pedidos_sistema,
                'pedidosExternos', pedidos_externos,
                'revenue', revenue,
                'revenueSistema', revenue_sistema,
                'revenueExterno', revenue_externo,
                'inversion', inversion
            )
            ORDER BY revenue DESC, chats DESC
        ) AS ads_json
      FROM ad_rows
     GROUP BY COALESCE(NULLIF(campaign_id, ''), 'sin_campaign'), COALESCE(NULLIF(campaign_name, ''), 'Sin campana')
)
SELECT
    COALESCE((
        SELECT json_agg(
            json_build_object(
                'source', source,
                'label', label,
                'total', total,
                'cotizaciones', cotizaciones,
                'ventas', pedidos,
                'pedidos', pedidos,
                'revenue', revenue
            )
            ORDER BY total DESC, label
        )
          FROM source_rows
    ), '[]'::json) AS por_fuente,
    COALESCE((
        SELECT json_agg(
            json_build_object(
                'adId', ad_id,
                'adName', ad_name,
                'adsetId', adset_id,
                'adsetName', adset_name,
                'campaignId', campaign_id,
                'campaignName', campaign_name,
                'status', ad_status,
                'chats', chats,
                'cotizaciones', cotizaciones,
                'ventas', pedidos,
                'pedidos', pedidos,
                'pedidosSistema', pedidos_sistema,
                'pedidosExternos', pedidos_externos,
                'clientesConPedido', clientes_con_pedido,
                'revenue', revenue,
                'revenueSistema', revenue_sistema,
                'revenueExterno', revenue_externo,
                'inversion', inversion,
                'costoPerChat', CASE WHEN chats > 0 THEN ROUND(inversion::numeric / chats::numeric, 2) ELSE 0 END,
                'costoPerPedido', CASE WHEN pedidos > 0 THEN ROUND(inversion::numeric / pedidos::numeric, 2) ELSE 0 END,
                'conversionPedido', CASE WHEN chats > 0 THEN ROUND((pedidos::numeric / chats::numeric) * 100, 2) ELSE 0 END,
                'roas', CASE WHEN inversion > 0 THEN ROUND(revenue::numeric / inversion::numeric, 2) ELSE 0 END,
                'roi', CASE WHEN inversion > 0 THEN ROUND(((revenue::numeric - inversion::numeric) / inversion::numeric) * 100, 2) ELSE 0 END,
                'referralSourceUrl', referral_source_url,
                'orders', orders_json
            )
            ORDER BY revenue DESC, pedidos DESC, chats DESC, inversion DESC, ad_name
        )
          FROM ad_rows
    ), '[]'::json) AS por_anuncio_meta,
    COALESCE((
        SELECT json_agg(
            json_build_object(
                'campaignId', campaign_id,
                'campaignName', campaign_name,
                'ads', ads,
                'chats', chats,
                'cotizaciones', cotizaciones,
                'pedidos', pedidos,
                'pedidosSistema', pedidos_sistema,
                'pedidosExternos', pedidos_externos,
                'clientesConPedido', clientes_con_pedido,
                'revenue', revenue,
                'revenueSistema', revenue_sistema,
                'revenueExterno', revenue_externo,
                'inversion', inversion,
                'costoPerChat', CASE WHEN chats > 0 THEN ROUND(inversion::numeric / chats::numeric, 2) ELSE 0 END,
                'costoPerPedido', CASE WHEN pedidos > 0 THEN ROUND(inversion::numeric / pedidos::numeric, 2) ELSE 0 END,
                'conversionPedido', CASE WHEN chats > 0 THEN ROUND((pedidos::numeric / chats::numeric) * 100, 2) ELSE 0 END,
                'roas', CASE WHEN inversion > 0 THEN ROUND(revenue::numeric / inversion::numeric, 2) ELSE 0 END,
                'roi', CASE WHEN inversion > 0 THEN ROUND(((revenue::numeric - inversion::numeric) / inversion::numeric) * 100, 2) ELSE 0 END,
                'adsDetalle', ads_json
            )
            ORDER BY revenue DESC, pedidos DESC, inversion DESC, campaign_name
        )
          FROM campaign_rows
    ), '[]'::json) AS por_campania_meta`;

    const { rows } = await queryPostgres(sql, reportParams(ctx));
    return {
        porFuente: Array.isArray(rows[0]?.por_fuente) ? rows[0].por_fuente : [],
        porAnuncioMeta: Array.isArray(rows[0]?.por_anuncio_meta) ? rows[0].por_anuncio_meta : [],
        porCampaniaMeta: Array.isArray(rows[0]?.por_campania_meta) ? rows[0].por_campania_meta : []
    };
}

async function getReportCampaigns(ctx) {
    const sql = `
WITH bounds AS (
    SELECT
        ($2::date::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}') AS starts_at,
        (($3::date + 1)::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}') AS ends_at
),
campaign_scope AS (
    SELECT c.*
      FROM tenant_campaigns c
     WHERE c.tenant_id = $1
       AND (
            c.created_at >= (SELECT starts_at FROM bounds)
            OR c.updated_at >= (SELECT starts_at FROM bounds)
            OR EXISTS (
                SELECT 1
                  FROM tenant_campaign_recipients r
                 WHERE r.tenant_id = c.tenant_id
                   AND r.campaign_id = c.campaign_id
                   AND COALESCE(r.sent_at, r.created_at) >= (SELECT starts_at FROM bounds)
                   AND COALESCE(r.sent_at, r.created_at) < (SELECT ends_at FROM bounds)
                   AND NOT EXISTS (
                        SELECT 1
                          FROM tenant_test_contacts tc
                         WHERE tc.tenant_id = r.tenant_id
                           AND regexp_replace(COALESCE(r.phone, ''), '[^0-9]', '', 'g')
                               LIKE '%' || regexp_replace(COALESCE(tc.phone_e164, ''), '[^0-9]', '', 'g') || '%'
                   )
            )
       )
       AND c.created_at < (SELECT ends_at FROM bounds)
       AND ($4::text IS NULL OR c.created_by = $4::text OR c.updated_by = $4::text)
       AND (
            $5::text IS NULL
            OR LOWER(COALESCE(c.scope_module_id, '')) = LOWER($5::text)
            OR LOWER(COALESCE(c.module_id, '')) = LOWER($5::text)
       )
),
${SCOPED_CHATS_CTE},
campaign_chat_status AS (
    SELECT
        o.campaign_id,
        o.chat_id,
        s.status
      FROM tenant_chat_origins o
      JOIN scoped_chats sc ON sc.chat_id = o.chat_id
      LEFT JOIN tenant_chat_commercial_status s
        ON s.tenant_id = o.tenant_id
       AND s.chat_id = o.chat_id
       AND LOWER(COALESCE(s.scope_module_id, '')) = LOWER(COALESCE(o.scope_module_id, ''))
      CROSS JOIN bounds b
     WHERE o.tenant_id = $1
       AND COALESCE(o.origin_source, o.origin_type, '') = 'campaign'
       AND COALESCE(o.detected_at, o.created_at) >= b.starts_at
       AND COALESCE(o.detected_at, o.created_at) < b.ends_at
       AND ($5::text IS NULL OR LOWER(COALESCE(o.scope_module_id, '')) = LOWER($5::text))
),
campaign_status_counts AS (
    SELECT
        campaign_id,
        COUNT(DISTINCT chat_id) AS respondieron,
        COUNT(DISTINCT chat_id) FILTER (WHERE status = 'cotizado') AS cotizados
      FROM campaign_chat_status
     GROUP BY campaign_id
),
campaign_quote_counts AS (
    SELECT
        ccs.campaign_id,
        COUNT(DISTINCT q.quote_id) AS cotizaciones
      FROM campaign_chat_status ccs
      JOIN tenant_quotes q
        ON q.tenant_id = $1
       AND q.chat_id = ccs.chat_id
       AND q.created_at >= (SELECT starts_at FROM bounds)
       AND q.created_at < (SELECT ends_at FROM bounds)
       AND ($5::text IS NULL OR LOWER(COALESCE(q.scope_module_id, '')) = LOWER($5::text))
     GROUP BY ccs.campaign_id
),
campaign_order_counts AS (
    SELECT
        ccs.campaign_id,
        COUNT(DISTINCT o.chat_id) FILTER (WHERE o.status IN ${ORDER_REVENUE_STATUSES_SQL}) AS pedidos,
        COUNT(DISTINCT o.chat_id) FILTER (WHERE o.status = 'aceptado') AS aceptados,
        COUNT(DISTINCT o.chat_id) FILTER (WHERE o.status IN ('programado', 'atendido', 'vendido')) AS proyeccion_ventas,
        COUNT(DISTINCT o.chat_id) FILTER (WHERE o.status IN ('atendido', 'vendido')) AS ventas_confirmadas
      FROM campaign_chat_status ccs
      JOIN tenant_orders o
        ON o.tenant_id = $1
       AND o.chat_id = ccs.chat_id
       AND o.created_at >= (SELECT starts_at FROM bounds)
       AND o.created_at < (SELECT ends_at FROM bounds)
       AND o.status IN ${ORDER_REVENUE_STATUSES_SQL}
       AND ($4::text IS NULL OR o.created_by_user_id = $4::text OR o.assigned_user_id = $4::text)
       AND ($5::text IS NULL OR LOWER(COALESCE(o.scope_module_id, '')) = LOWER($5::text))
     GROUP BY ccs.campaign_id
)
SELECT
    c.campaign_id,
    c.campaign_name,
    c.status,
    COALESCE((
        SELECT COUNT(*)
          FROM tenant_campaign_recipients r
         WHERE r.tenant_id = c.tenant_id
           AND r.campaign_id = c.campaign_id
           AND (r.status = 'sent' OR r.sent_at IS NOT NULL)
           AND COALESCE(r.sent_at, r.created_at) >= (SELECT starts_at FROM bounds)
           AND COALESCE(r.sent_at, r.created_at) < (SELECT ends_at FROM bounds)
           AND NOT EXISTS (
                SELECT 1
                  FROM tenant_test_contacts tc
                 WHERE tc.tenant_id = r.tenant_id
                   AND regexp_replace(COALESCE(r.phone, ''), '[^0-9]', '', 'g')
                       LIKE '%' || regexp_replace(COALESCE(tc.phone_e164, ''), '[^0-9]', '', 'g') || '%'
           )
    ), 0) AS enviados,
    COALESCE(csc.respondieron, 0) AS respondieron,
    COALESCE(cqc.cotizaciones, 0) AS cotizaciones,
    COALESCE(csc.cotizados, 0) AS cotizados,
    COALESCE(coc.pedidos, 0) AS pedidos,
    COALESCE(coc.aceptados, 0) AS aceptados,
    COALESCE(coc.proyeccion_ventas, 0) AS proyeccion_ventas,
    COALESCE(coc.ventas_confirmadas, 0) AS ventas_confirmadas
  FROM campaign_scope c
  LEFT JOIN campaign_status_counts csc ON csc.campaign_id = c.campaign_id
  LEFT JOIN campaign_quote_counts cqc ON cqc.campaign_id = c.campaign_id
  LEFT JOIN campaign_order_counts coc ON coc.campaign_id = c.campaign_id
 ORDER BY c.updated_at DESC, c.created_at DESC`;

    const { rows } = await queryPostgres(sql, reportParams(ctx));
    return rows.map((row) => {
        const enviados = toNumber(row.enviados);
        const respondieron = toNumber(row.respondieron);
        return {
            campaignId: row.campaign_id,
            campaignName: row.campaign_name,
            status: row.status,
            enviados,
            respondieron,
            cotizaciones: toNumber(row.cotizaciones),
            cotizados: toNumber(row.cotizados),
            pedidos: toNumber(row.pedidos),
            aceptados: toNumber(row.aceptados),
            proyeccionVentas: toNumber(row.proyeccion_ventas),
            ventasConfirmadas: toNumber(row.ventas_confirmadas),
            tasaRespuesta: enviados > 0 ? roundNumber((respondieron / enviados) * 100) : 0,
            conversionProyeccion: respondieron > 0 ? roundNumber((toNumber(row.proyeccion_ventas) / respondieron) * 100) : 0,
            conversionConfirmada: respondieron > 0 ? roundNumber((toNumber(row.ventas_confirmadas) / respondieron) * 100) : 0
        };
    });
}

async function getDailyActivity(ctx) {
    const sql = `
WITH bounds AS (
    SELECT
        ($2::date::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}') AS starts_at,
        (($3::date + 1)::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}') AS ends_at
),
days AS (
    SELECT generate_series($2::date, $3::date, INTERVAL '1 day')::date AS day
),
${SCOPED_CHATS_CTE}
SELECT
    d.day AS date,
    COALESCE((
        SELECT COUNT(DISTINCT c.chat_id)
          FROM tenant_chats c
          JOIN scoped_chats sc ON sc.chat_id = c.chat_id
         WHERE c.tenant_id = $1
           AND DATE(c.created_at AT TIME ZONE '${REPORT_TIME_ZONE}') = d.day
    ), 0) AS chats_nuevos,
    COALESCE((
        SELECT COUNT(*)
          FROM tenant_messages m
          JOIN scoped_chats sc ON sc.chat_id = m.chat_id
         WHERE m.tenant_id = $1
           AND m.from_me = true
           AND DATE(m.created_at AT TIME ZONE '${REPORT_TIME_ZONE}') = d.day
           AND ($4::text IS NULL OR ${SENT_BY_USER_SQL} = $4::text)
           AND ($5::text IS NULL OR ${MESSAGE_MODULE_SQL} = LOWER($5::text))
    ), 0) AS mensajes_enviados,
    COALESCE((
        SELECT COUNT(*)
          FROM tenant_messages m
          JOIN scoped_chats sc ON sc.chat_id = m.chat_id
         WHERE m.tenant_id = $1
           AND m.from_me = false
           AND DATE(m.created_at AT TIME ZONE '${REPORT_TIME_ZONE}') = d.day
           AND ($5::text IS NULL OR ${MESSAGE_MODULE_SQL} = LOWER($5::text))
    ), 0) AS mensajes_recibidos,
    COALESCE((
        SELECT COUNT(DISTINCT q.quote_id)
          FROM tenant_quotes q
          JOIN scoped_chats sc ON sc.chat_id = q.chat_id
         WHERE q.tenant_id = $1
           AND DATE(q.created_at AT TIME ZONE '${REPORT_TIME_ZONE}') = d.day
           AND ($4::text IS NULL OR q.created_by_user_id = $4::text)
           AND ($5::text IS NULL OR LOWER(COALESCE(q.scope_module_id, '')) = LOWER($5::text))
    ), 0) AS cotizaciones,
    COALESCE((
        SELECT COUNT(DISTINCT o.order_id)
          FROM tenant_orders o
          JOIN scoped_chats sc ON sc.chat_id = o.chat_id
         WHERE o.tenant_id = $1
           AND DATE(o.created_at AT TIME ZONE '${REPORT_TIME_ZONE}') = d.day
           AND o.status IN ${ORDER_REVENUE_STATUSES_SQL}
           AND ($4::text IS NULL OR o.created_by_user_id = $4::text OR o.assigned_user_id = $4::text)
           AND ($5::text IS NULL OR LOWER(COALESCE(o.scope_module_id, '')) = LOWER($5::text))
    ), 0) AS pedidos,
    COALESCE((
        SELECT AVG(EXTRACT(EPOCH FROM (s.first_agent_response_at - s.first_customer_message_at)) / 60)
          FROM tenant_chat_commercial_status s
          JOIN scoped_chats sc ON sc.chat_id = s.chat_id
         WHERE s.tenant_id = $1
           AND s.first_customer_message_at IS NOT NULL
           AND s.first_agent_response_at IS NOT NULL
           AND DATE(s.first_agent_response_at AT TIME ZONE '${REPORT_TIME_ZONE}') = d.day
           AND ($5::text IS NULL OR LOWER(COALESCE(s.scope_module_id, '')) = LOWER($5::text))
    ), 0) AS tiempo_respuesta_promedio
  FROM days d
 ORDER BY d.day`;

    const { rows } = await queryPostgres(sql, reportParams(ctx));
    return rows.map((row) => ({
        date: toDateLabel(row.date),
        chatsNuevos: toNumber(row.chats_nuevos),
        mensajesEnviados: toNumber(row.mensajes_enviados),
        mensajesRecibidos: toNumber(row.mensajes_recibidos),
        cotizaciones: toNumber(row.cotizaciones),
        pedidos: toNumber(row.pedidos),
        tiempoRespuestaPromedio: roundNumber(row.tiempo_respuesta_promedio)
    }));
}

function parseTimeToMinutes(value = '') {
    const match = cleanText(value).match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return hour * 60 + minute;
}

function getDateTimeParts(dateValue, timeZone = REPORT_TIME_ZONE) {
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).formatToParts(date);
    const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const hour = Number(byType.hour === '24' ? '0' : byType.hour);
    return {
        dayKey: WEEKDAY_TO_KEY[byType.weekday] || 'mon',
        hour,
        minute: Number(byType.minute || 0)
    };
}

function isWithinWeeklyHours(dateValue, schedule = {}) {
    const timezone = cleanText(schedule.timezone) || REPORT_TIME_ZONE;
    const weeklyHours = schedule.weekly_hours && typeof schedule.weekly_hours === 'object'
        ? schedule.weekly_hours
        : {};
    const parts = getDateTimeParts(dateValue, timezone);
    const minuteOfDay = (parts.hour * 60) + parts.minute;
    const ranges = Array.isArray(weeklyHours[parts.dayKey]) ? weeklyHours[parts.dayKey] : [];
    return ranges.some((range) => {
        const start = parseTimeToMinutes(range?.start);
        const end = parseTimeToMinutes(range?.end);
        if (start === null || end === null || start === end) return false;
        if (start < end) return minuteOfDay >= start && minuteOfDay < end;
        return minuteOfDay >= start || minuteOfDay < end;
    });
}

function makeScheduleHourStats() {
    return Array.from({ length: 24 }, (_, hour) => ({
        hora: hour,
        mensajes: 0,
        chatsSet: new Set()
    }));
}

function makeScheduleDayStats() {
    return DAY_KEYS.map((key) => ({
        key,
        dia: DAY_LABELS[key],
        mensajes: 0,
        chatsSet: new Set(),
        responseMinutes: []
    }));
}

async function getScheduleReport(ctx) {
    const scheduleResult = await queryPostgres(
        `SELECT timezone, weekly_hours
           FROM tenant_schedules
          WHERE tenant_id = $1
            AND is_active = true
          ORDER BY updated_at DESC
          LIMIT 1`,
        [ctx.tenantId]
    );
    const schedule = scheduleResult.rows[0] || { timezone: REPORT_TIME_ZONE, weekly_hours: {} };
    const sql = `
WITH bounds AS (
    SELECT
        ($2::date::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}') AS starts_at,
        (($3::date + 1)::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}') AS ends_at
),
${SCOPED_CHATS_CTE}
SELECT m.message_id, m.chat_id, m.created_at, m.from_me
  FROM tenant_messages m
  JOIN scoped_chats sc ON sc.chat_id = m.chat_id
 WHERE m.tenant_id = $1
   AND m.created_at >= (SELECT starts_at FROM bounds)
   AND m.created_at < (SELECT ends_at FROM bounds)
   AND ($4::text IS NULL OR (m.from_me = true AND ${SENT_BY_USER_SQL} = $4::text))
   AND ($5::text IS NULL OR ${MESSAGE_MODULE_SQL} = LOWER($5::text))
 ORDER BY m.created_at`;
    const responseSql = `
WITH bounds AS (
    SELECT
        ($2::date::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}') AS starts_at,
        (($3::date + 1)::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}') AS ends_at
),
${SCOPED_CHATS_CTE}
SELECT s.chat_id, s.first_customer_message_at, s.first_agent_response_at
  FROM tenant_chat_commercial_status s
  JOIN scoped_chats sc ON sc.chat_id = s.chat_id
 WHERE s.tenant_id = $1
   AND s.first_customer_message_at IS NOT NULL
   AND s.first_agent_response_at IS NOT NULL
   AND s.first_agent_response_at >= (SELECT starts_at FROM bounds)
   AND s.first_agent_response_at < (SELECT ends_at FROM bounds)
   AND ($5::text IS NULL OR LOWER(COALESCE(s.scope_module_id, '')) = LOWER($5::text))`;
    const [messagesResult, responsesResult] = await Promise.all([
        queryPostgres(sql, reportParams(ctx)),
        queryPostgres(responseSql, reportParams(ctx))
    ]);

    const hourStats = makeScheduleHourStats();
    const dayStats = makeScheduleDayStats();
    let dentroHorario = 0;
    let fueraHorario = 0;

    for (const row of messagesResult.rows) {
        const parts = getDateTimeParts(row.created_at, cleanText(schedule.timezone) || REPORT_TIME_ZONE);
        const hourEntry = hourStats[parts.hour];
        const dayEntry = dayStats.find((entry) => entry.key === parts.dayKey);
        const chatId = cleanText(row.chat_id);
        hourEntry.mensajes += 1;
        if (chatId) hourEntry.chatsSet.add(chatId);
        if (dayEntry) {
            dayEntry.mensajes += 1;
            if (chatId) dayEntry.chatsSet.add(chatId);
        }
        if (isWithinWeeklyHours(row.created_at, schedule)) {
            dentroHorario += 1;
        } else {
            fueraHorario += 1;
        }
    }

    for (const row of responsesResult.rows) {
        const parts = getDateTimeParts(row.first_agent_response_at, cleanText(schedule.timezone) || REPORT_TIME_ZONE);
        const dayEntry = dayStats.find((entry) => entry.key === parts.dayKey);
        const minutes = (new Date(row.first_agent_response_at).getTime() - new Date(row.first_customer_message_at).getTime()) / 60000;
        if (dayEntry && Number.isFinite(minutes) && minutes >= 0) {
            dayEntry.responseMinutes.push(minutes);
        }
    }

    return {
        dentroHorario,
        fueraHorario,
        porHora: hourStats.map((entry) => ({
            hora: entry.hora,
            mensajes: entry.mensajes,
            chats: entry.chatsSet.size
        })),
        porDiaSemana: dayStats.map((entry) => ({
            dia: entry.dia,
            mensajes: entry.mensajes,
            chats: entry.chatsSet.size,
            tiempoRespuesta: entry.responseMinutes.length
                ? roundNumber(entry.responseMinutes.reduce((acc, value) => acc + value, 0) / entry.responseMinutes.length)
                : 0
        }))
    };
}

function registerOperationsReportsHttpRoutes({
    app,
    authService,
    accessPolicyService,
    isTenantAllowedForUser,
    hasAnyPermission,
    hasOperationsKpiReadAccess,
    aiService
}) {
    if (!app) throw new Error('registerOperationsReportsHttpRoutes requiere app.');

    const deps = {
        authService,
        accessPolicyService,
        isTenantAllowedForUser,
        hasAnyPermission,
        hasOperationsKpiReadAccess,
        aiService
    };

    async function handleReport(req, res, loader) {
        try {
            assertPostgresReports();
            const ctx = buildReportContext(req, res, deps);
            if (!ctx) return;
            const data = await loader(ctx);
            res.json({
                ok: true,
                tenantId: ctx.tenantId,
                dateFrom: ctx.dateFrom,
                dateTo: ctx.dateTo,
                userId: ctx.userId,
                moduleId: ctx.moduleId,
                data
            });
        } catch (error) {
            res.status(400).json({
                ok: false,
                error: String(error?.message || 'No se pudo cargar el reporte.')
            });
        }
    }

    app.get('/api/tenant/test-contacts', async (req, res) => {
        try {
            assertPostgresReports();
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenantId = resolveTenantId(req);
            if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
            if (!canReadTestContacts(req, tenantId, deps)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }
            const query = cleanText(req.query?.q || req.query?.query);
            const [items, candidates] = await Promise.all([
                listTestContacts(tenantId),
                query ? searchTestContactCandidates(tenantId, query) : Promise.resolve([])
            ]);
            return res.json({ ok: true, tenantId, items, candidates });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudieron cargar numeros de prueba.') });
        }
    });

    app.post('/api/tenant/test-contacts', async (req, res) => {
        try {
            assertPostgresReports();
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenantId = resolveTenantId(req);
            if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
            if (!canManageTestContacts(req, tenantId, deps)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }
            const item = await upsertTestContact(tenantId, req.body || {});
            const items = await listTestContacts(tenantId);
            return res.json({ ok: true, tenantId, item, items });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo guardar el numero de prueba.') });
        }
    });

    app.delete('/api/tenant/test-contacts/:phone', async (req, res) => {
        try {
            assertPostgresReports();
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenantId = resolveTenantId(req);
            if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
            if (!canManageTestContacts(req, tenantId, deps)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }
            const phoneE164 = await deleteTestContact(tenantId, req.params?.phone);
            const items = await listTestContacts(tenantId);
            return res.json({ ok: true, tenantId, phoneE164, items });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo quitar el numero de prueba.') });
        }
    });

    app.get('/api/tenant/reports/kpis', (req, res) => handleReport(req, res, getReportKpis));
    app.get('/api/tenant/reports/funnel', (req, res) => handleReport(req, res, getReportFunnel));
    app.get('/api/tenant/reports/equipo', (req, res) => handleReport(req, res, getReportTeam));
    app.get('/api/tenant/reports/origenes', (req, res) => handleReport(req, res, getReportOrigins));
    app.get('/api/tenant/reports/campanas', (req, res) => handleReport(req, res, getReportCampaigns));
    app.get('/api/tenant/reports/actividad-diaria', (req, res) => handleReport(req, res, getDailyActivity));
    app.get('/api/tenant/reports/horarios', (req, res) => handleReport(req, res, getScheduleReport));

    app.post('/api/tenant/reports/analyze', async (req, res) => {
        try {
            assertPostgresReports();
            const ctx = buildReportAnalysisContext(req, res, deps);
            if (!ctx) return;
            if (typeof aiService?.analyzeOperationalReports !== 'function') {
                res.status(500).json({ ok: false, error: 'Servicio IA de reportes no disponible.' });
                return;
            }

            const analysis = await aiService.analyzeOperationalReports({
                tenantId: ctx.tenantId,
                reportData: ctx.reportData,
                dateFrom: ctx.dateFrom,
                dateTo: ctx.dateTo,
                filters: {
                    userId: ctx.userId,
                    moduleId: ctx.moduleId,
                    userLabel: ctx.userLabel,
                    moduleLabel: ctx.moduleLabel
                }
            });

            res.json({
                ok: true,
                tenantId: ctx.tenantId,
                dateFrom: ctx.dateFrom,
                dateTo: ctx.dateTo,
                analysis
            });
        } catch (error) {
            res.status(400).json({
                ok: false,
                error: String(error?.message || 'No se pudo generar el analisis IA.')
            });
        }
    });
}

module.exports = {
    registerOperationsReportsHttpRoutes
};
