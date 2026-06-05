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

const QUOTE_TOTAL_SQL = `COALESCE(
    NULLIF(
        regexp_replace(
            COALESCE(
                q.summary_json->>'totalPayable',
                q.summary_json->>'total_payable',
                q.summary_json->>'total',
                '0'
            ),
            '[^0-9.-]',
            '',
            'g'
        ),
        ''
    )::numeric,
    0
)`;

const SCOPED_CHATS_CTE = `
scoped_chats AS (
    SELECT c.chat_id
      FROM tenant_chats c
     WHERE c.tenant_id = $1
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
        ticketPromedio: roundNumber(row.ticket_promedio),
        revenueEstimado: roundNumber(row.revenue_estimado),
        mensajesEnviados: toNumber(row.mensajes_enviados),
        mensajesRecibidos: toNumber(row.mensajes_recibidos),
        tiempoRespuestaPromedio: roundNumber(row.tiempo_respuesta_promedio),
        chatsActivos: toNumber(row.chats_activos),
        tasaConversion: roundNumber(row.tasa_conversion)
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
        ($2::date::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}') AS starts_at,
        (($3::date + 1)::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}') AS ends_at
    UNION ALL
    SELECT
        'previous'::text AS label,
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
            SELECT COUNT(DISTINCT q.quote_id)
              FROM tenant_quotes q
              JOIN scoped_chats sc ON sc.chat_id = q.chat_id
             WHERE q.tenant_id = $1
               AND q.created_at >= p.starts_at
               AND q.created_at < p.ends_at
               AND q.status IN ('chosen', 'sent')
               AND ($4::text IS NULL OR q.created_by_user_id = $4::text)
               AND ($5::text IS NULL OR LOWER(COALESCE(q.scope_module_id, '')) = LOWER($5::text))
        ) AS cotizaciones_elegidas,
        (
            SELECT AVG(${QUOTE_TOTAL_SQL})
              FROM tenant_quotes q
              JOIN scoped_chats sc ON sc.chat_id = q.chat_id
             WHERE q.tenant_id = $1
               AND q.created_at >= p.starts_at
               AND q.created_at < p.ends_at
               AND q.status IN ('chosen', 'sent')
               AND ($4::text IS NULL OR q.created_by_user_id = $4::text)
               AND ($5::text IS NULL OR LOWER(COALESCE(q.scope_module_id, '')) = LOWER($5::text))
        ) AS ticket_promedio,
        (
            SELECT SUM(${QUOTE_TOTAL_SQL})
              FROM tenant_quotes q
              JOIN scoped_chats sc ON sc.chat_id = q.chat_id
             WHERE q.tenant_id = $1
               AND q.created_at >= p.starts_at
               AND q.created_at < p.ends_at
               AND q.status IN ('chosen', 'sent')
               AND ($4::text IS NULL OR q.created_by_user_id = $4::text)
               AND ($5::text IS NULL OR LOWER(COALESCE(q.scope_module_id, '')) = LOWER($5::text))
        ) AS revenue_estimado,
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
    COALESCE(ticket_promedio, 0) AS ticket_promedio,
    COALESCE(revenue_estimado, 0) AS revenue_estimado,
    mensajes_enviados,
    mensajes_recibidos,
    COALESCE(tiempo_respuesta_promedio, 0) AS tiempo_respuesta_promedio,
    chats_activos,
    CASE WHEN chats_nuevos > 0
        THEN ROUND((cotizaciones_elegidas::numeric / chats_nuevos::numeric) * 100, 2)
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
        COUNT(DISTINCT sr.chat_id) FILTER (WHERE sr.status = 'vendido') AS vendido,
        COUNT(DISTINCT sr.chat_id) FILTER (WHERE sr.status = 'perdido') AS perdido
      FROM days d
      LEFT JOIN status_rows sr ON sr.day = d.day
     GROUP BY d.day
     ORDER BY d.day
)
SELECT
    COALESCE((SELECT total FROM counts WHERE status = 'nuevo'), 0) AS nuevo,
    COALESCE((SELECT total FROM counts WHERE status = 'en_conversacion'), 0) AS en_conversacion,
    COALESCE((SELECT total FROM counts WHERE status = 'cotizado'), 0) AS cotizado,
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
                    'vendido', vendido,
                    'perdido', perdido
                )
                ORDER BY day
            )
              FROM daily
        ),
        '[]'::json
    ) AS por_dia`;

    const { rows } = await queryPostgres(sql, reportParams(ctx));
    const row = rows[0] || {};
    return {
        nuevo: toNumber(row.nuevo),
        enConversacion: toNumber(row.en_conversacion),
        cotizado: toNumber(row.cotizado),
        vendido: toNumber(row.vendido),
        perdido: toNumber(row.perdido),
        expirado: toNumber(row.expirado),
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
         WHERE a.tenant_id = $1
           AND a.assignee_user_id = tu.user_id
           AND COALESCE(a.status, 'active') <> 'inactive'
           AND ($5::text IS NULL OR LOWER(COALESCE(a.scope_module_id, '')) = LOWER($5::text))
    ), 0) AS chats_asignados,
    COALESCE((
        SELECT COUNT(DISTINCT s.chat_id)
          FROM tenant_chat_commercial_status s
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
         WHERE q.tenant_id = $1
           AND q.created_by_user_id = tu.user_id
           AND q.created_at >= (SELECT starts_at FROM bounds)
           AND q.created_at < (SELECT ends_at FROM bounds)
           AND ($5::text IS NULL OR LOWER(COALESCE(q.scope_module_id, '')) = LOWER($5::text))
    ), 0) AS cotizaciones,
    COALESCE((
        SELECT COUNT(DISTINCT q.quote_id)
          FROM tenant_quotes q
         WHERE q.tenant_id = $1
           AND q.created_by_user_id = tu.user_id
           AND q.status IN ('chosen', 'sent')
           AND q.created_at >= (SELECT starts_at FROM bounds)
           AND q.created_at < (SELECT ends_at FROM bounds)
           AND ($5::text IS NULL OR LOWER(COALESCE(q.scope_module_id, '')) = LOWER($5::text))
    ), 0) AS ventas,
    COALESCE((
        SELECT COUNT(*)
          FROM tenant_messages m
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
      CROSS JOIN bounds b
     WHERE o.tenant_id = $1
       AND COALESCE(o.detected_at, o.created_at) >= b.starts_at
       AND COALESCE(o.detected_at, o.created_at) < b.ends_at
       AND ($5::text IS NULL OR LOWER(COALESCE(o.scope_module_id, '')) = LOWER($5::text))
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
        COUNT(DISTINCT q.quote_id) AS cotizaciones,
        COUNT(DISTINCT o.chat_id) FILTER (WHERE s.status = 'vendido' OR q.status IN ('chosen', 'sent')) AS ventas
      FROM origins o
      LEFT JOIN tenant_quotes q
        ON q.tenant_id = o.tenant_id
       AND q.chat_id = o.chat_id
       AND q.created_at >= (SELECT starts_at FROM bounds)
       AND q.created_at < (SELECT ends_at FROM bounds)
      LEFT JOIN tenant_chat_commercial_status s
        ON s.tenant_id = o.tenant_id
       AND s.chat_id = o.chat_id
     GROUP BY 1, 2
),
ad_origins AS (
    SELECT DISTINCT
        o.chat_id,
        o.referral_source_id AS ad_id,
        o.referral_headline,
        o.campaign_id,
        o.referral_source_url
      FROM origins o
     WHERE COALESCE(o.referral_source_id, '') <> ''
       AND COALESCE(o.origin_source, o.origin_type, '') IN ('meta_ad', 'ad', 'meta')
),
ad_spend AS (
    SELECT
        i.object_id AS ad_id,
        SUM(i.spend) AS spend
      FROM tenant_meta_ads_insights i
     WHERE i.tenant_id = $1
       AND i.object_type = 'ad'
       AND i.date_start >= $2::date
       AND i.date_stop <= $3::date
     GROUP BY i.object_id
),
ad_rows AS (
    SELECT
        ao.ad_id,
        COALESCE(ad.object_name, MAX(ao.referral_headline), ao.ad_id) AS ad_name,
        COALESCE(campaign.object_name, MAX(ao.campaign_id), '') AS campaign_name,
        COUNT(DISTINCT ao.chat_id) AS chats,
        COUNT(DISTINCT q.quote_id) AS cotizaciones,
        COUNT(DISTINCT ao.chat_id) FILTER (WHERE s.status = 'vendido' OR q.status IN ('chosen', 'sent')) AS ventas,
        COALESCE(MAX(sp.spend), 0) AS inversion
      FROM ad_origins ao
      LEFT JOIN tenant_meta_ads_structure ad
        ON ad.tenant_id = $1
       AND ad.object_id = ao.ad_id
       AND ad.object_type = 'ad'
      LEFT JOIN tenant_meta_ads_structure adset
        ON adset.tenant_id = $1
       AND adset.object_id = ad.parent_id
       AND adset.object_type = 'adset'
      LEFT JOIN tenant_meta_ads_structure campaign
        ON campaign.tenant_id = $1
       AND campaign.object_id = COALESCE(NULLIF(ao.campaign_id, ''), adset.parent_id)
       AND campaign.object_type = 'campaign'
      LEFT JOIN ad_spend sp ON sp.ad_id = ao.ad_id
      LEFT JOIN tenant_quotes q
        ON q.tenant_id = $1
       AND q.chat_id = ao.chat_id
       AND q.created_at >= (SELECT starts_at FROM bounds)
       AND q.created_at < (SELECT ends_at FROM bounds)
      LEFT JOIN tenant_chat_commercial_status s
        ON s.tenant_id = $1
       AND s.chat_id = ao.chat_id
     GROUP BY ao.ad_id, ad.object_name, campaign.object_name
)
SELECT
    COALESCE((
        SELECT json_agg(
            json_build_object(
                'source', source,
                'label', label,
                'total', total,
                'cotizaciones', cotizaciones,
                'ventas', ventas
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
                'campaignName', campaign_name,
                'chats', chats,
                'cotizaciones', cotizaciones,
                'ventas', ventas,
                'inversion', inversion,
                'costoPerChat', CASE WHEN chats > 0 THEN ROUND(inversion::numeric / chats::numeric, 2) ELSE 0 END
            )
            ORDER BY chats DESC, inversion DESC, ad_name
        )
          FROM ad_rows
    ), '[]'::json) AS por_anuncio_meta`;

    const { rows } = await queryPostgres(sql, reportParams(ctx));
    return {
        porFuente: Array.isArray(rows[0]?.por_fuente) ? rows[0].por_fuente : [],
        porAnuncioMeta: Array.isArray(rows[0]?.por_anuncio_meta) ? rows[0].por_anuncio_meta : []
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
            )
       )
       AND c.created_at < (SELECT ends_at FROM bounds)
       AND ($4::text IS NULL OR c.created_by = $4::text OR c.updated_by = $4::text)
       AND (
            $5::text IS NULL
            OR LOWER(COALESCE(c.scope_module_id, '')) = LOWER($5::text)
            OR LOWER(COALESCE(c.module_id, '')) = LOWER($5::text)
       )
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
    ), 0) AS enviados,
    COALESCE((
        SELECT COUNT(DISTINCT o.chat_id)
          FROM tenant_chat_origins o
         WHERE o.tenant_id = c.tenant_id
           AND o.campaign_id = c.campaign_id
           AND COALESCE(o.origin_source, o.origin_type, '') = 'campaign'
           AND COALESCE(o.detected_at, o.created_at) >= (SELECT starts_at FROM bounds)
           AND COALESCE(o.detected_at, o.created_at) < (SELECT ends_at FROM bounds)
    ), 0) AS respondieron,
    COALESCE((
        SELECT COUNT(DISTINCT q.quote_id)
          FROM tenant_chat_origins o
          JOIN tenant_quotes q
            ON q.tenant_id = o.tenant_id
           AND q.chat_id = o.chat_id
         WHERE o.tenant_id = c.tenant_id
           AND o.campaign_id = c.campaign_id
           AND COALESCE(o.origin_source, o.origin_type, '') = 'campaign'
           AND q.created_at >= (SELECT starts_at FROM bounds)
           AND q.created_at < (SELECT ends_at FROM bounds)
    ), 0) AS cotizaciones
  FROM campaign_scope c
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
            tasaRespuesta: enviados > 0 ? roundNumber((respondieron / enviados) * 100) : 0
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
    hasOperationsKpiReadAccess
}) {
    if (!app) throw new Error('registerOperationsReportsHttpRoutes requiere app.');

    const deps = {
        authService,
        accessPolicyService,
        isTenantAllowedForUser,
        hasAnyPermission,
        hasOperationsKpiReadAccess
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

    app.get('/api/tenant/reports/kpis', (req, res) => handleReport(req, res, getReportKpis));
    app.get('/api/tenant/reports/funnel', (req, res) => handleReport(req, res, getReportFunnel));
    app.get('/api/tenant/reports/equipo', (req, res) => handleReport(req, res, getReportTeam));
    app.get('/api/tenant/reports/origenes', (req, res) => handleReport(req, res, getReportOrigins));
    app.get('/api/tenant/reports/campanas', (req, res) => handleReport(req, res, getReportCampaigns));
    app.get('/api/tenant/reports/actividad-diaria', (req, res) => handleReport(req, res, getDailyActivity));
    app.get('/api/tenant/reports/horarios', (req, res) => handleReport(req, res, getScheduleReport));
}

module.exports = {
    registerOperationsReportsHttpRoutes
};
