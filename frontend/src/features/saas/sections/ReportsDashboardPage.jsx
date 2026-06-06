import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SaasEntityPage } from '../components/entity';

const TIME_ZONE = 'America/Lima';
const EMPTY_REPORTS = {
    kpis: null,
    funnel: null,
    equipo: [],
    origenes: { porFuente: [], porAnuncioMeta: [] },
    campanas: [],
    actividadDiaria: [],
    horarios: { dentroHorario: 0, fueraHorario: 0, porHora: [], porDiaSemana: [] }
};
const REPORT_ENDPOINTS = {
    kpis: '/api/tenant/reports/kpis',
    funnel: '/api/tenant/reports/funnel',
    equipo: '/api/tenant/reports/equipo',
    origenes: '/api/tenant/reports/origenes',
    campanas: '/api/tenant/reports/campanas',
    actividadDiaria: '/api/tenant/reports/actividad-diaria',
    horarios: '/api/tenant/reports/horarios'
};
const KPI_DEFS = [
    { key: 'chatsNuevos', label: 'Chats nuevos', type: 'integer', improve: 'up' },
    { key: 'tiempoRespuestaPromedio', label: 'Tiempo respuesta', type: 'minutes', improve: 'down' },
    { key: 'cotizaciones', label: 'Cotizaciones', type: 'integer', improve: 'up' },
    { key: 'tasaConversion', label: 'Tasa conversion', type: 'percent', improve: 'up' },
    { key: 'ticketPromedio', label: 'Ticket promedio', type: 'currency', improve: 'up' },
    { key: 'mensajesEnviados', label: 'Mensajes enviados', type: 'integer', improve: 'up' },
    { key: 'chatsActivos', label: 'Chats activos', type: 'integer', improve: 'up' },
    { key: 'revenueEstimado', label: 'Revenue estimado', type: 'currency', improve: 'up' }
];
const FUNNEL_STAGES = [
    { key: 'nuevo', label: 'Nuevo', color: '#9CA3AF', group: 'positive' },
    { key: 'enConversacion', label: 'En conv.', color: '#3B82F6', group: 'positive', rateFromKey: 'nuevo' },
    { key: 'cotizado', label: 'Cotizado', color: '#F59E0B', group: 'positive', rateFromKey: 'enConversacion' },
    { key: 'aceptado', label: 'Aceptado', color: '#F97316', group: 'positive', rateFromKey: 'cotizado', rateSuffix: 'de cotizados' },
    { key: 'programado', label: 'Programado', color: '#86EFAC', group: 'positive', rateFromKey: 'aceptado', rateSuffix: 'de aceptados' },
    { key: 'atendido', label: 'Atendido', color: '#22C55E', group: 'positive', rateFromKey: 'programado', rateSuffix: 'de programados' },
    { key: 'vendido', label: 'Vendido', color: '#15803D', group: 'positive', rateFromKey: 'atendido' },
    { key: 'perdido', label: 'Perdido', color: '#ef4444', group: 'negative' },
    { key: 'expirado', label: 'Expirado', color: '#6b7280', group: 'negative' }
];
const TEMPORAL_LINES = [
    { key: 'chatsNuevos', label: 'Chats nuevos', color: '#1D9E75' },
    { key: 'mensajesEnviados', label: 'Mensajes enviados', color: '#3b82f6' },
    { key: 'cotizaciones', label: 'Cotizaciones', color: '#f59e0b' }
];
const FUNNEL_LINES = [
    { key: 'nuevo', label: 'Nuevo', color: '#9CA3AF' },
    { key: 'enConversacion', label: 'En conv.', color: '#3B82F6' },
    { key: 'cotizado', label: 'Cotizado', color: '#F59E0B' },
    { key: 'aceptado', label: 'Aceptado', color: '#F97316' },
    { key: 'programado', label: 'Programado', color: '#86efac' },
    { key: 'atendido', label: 'Atendido', color: '#22C55E' },
    { key: 'vendido', label: 'Vendido', color: '#15803D' },
    { key: 'perdido', label: 'Perdido', color: '#EF4444' },
    { key: 'expirado', label: 'Expirado', color: '#6B7280' }
];
const ROLE_LABELS = {
    owner: 'Owner',
    admin: 'Admin',
    seller: 'Vendedora'
};
const PERIOD_PRESETS = [
    { key: 'today', label: 'Hoy', days: 0 },
    { key: 'yesterday', label: 'Ayer', days: 0 },
    { key: '7d', label: '7d', days: 6 },
    { key: '30d', label: '30d', days: 29 },
    { key: 'custom', label: 'Personalizado' }
];

const text = (value = '') => String(value ?? '').trim();
const toArray = (value) => (Array.isArray(value) ? value : []);
const number = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const percent = (value, digits = 1) => `${number(value).toFixed(digits)}%`;
const formatInt = (value) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 }).format(number(value));
const formatCurrency = (value) => `S/ ${new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number(value))}`;
const formatDateShort = (value = '') => {
    const clean = text(value);
    if (!clean) return '-';
    const [year, month, day] = clean.slice(0, 10).split('-');
    if (!year || !month || !day) return clean;
    return `${day}/${month}`;
};
const formatDateRangeLabel = (from = '', to = '') => `${formatDateShort(from)} - ${formatDateShort(to)}`;
const formatKpiValue = (value, type = 'integer') => {
    if (type === 'currency') return formatCurrency(value);
    if (type === 'percent') return percent(value, 1);
    if (type === 'minutes') return `${number(value).toFixed(number(value) >= 10 ? 0 : 1)} min`;
    return formatInt(value);
};

function getDateLabel(date = new Date()) {
    const safeDate = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(safeDate.getTime())) return '';
    return safeDate.toLocaleDateString('en-CA', { timeZone: TIME_ZONE });
}

function addDays(label = '', amount = 0) {
    const [year, month, day] = text(label).split('-').map((part) => Number(part));
    if (!year || !month || !day) return getDateLabel();
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + amount);
    return date.toISOString().slice(0, 10);
}

function getPresetRange(preset = '7d') {
    const today = getDateLabel();
    if (preset === 'today') return { dateFrom: today, dateTo: today };
    if (preset === 'yesterday') {
        const yesterday = addDays(today, -1);
        return { dateFrom: yesterday, dateTo: yesterday };
    }
    const match = PERIOD_PRESETS.find((item) => item.key === preset);
    const days = Number.isFinite(match?.days) ? match.days : 6;
    return { dateFrom: addDays(today, -days), dateTo: today };
}

function buildReportQuery({ tenantId, dateFrom, dateTo, userId, moduleId }) {
    const params = new URLSearchParams();
    params.set('tenantId', tenantId);
    params.set('dateFrom', dateFrom);
    params.set('dateTo', dateTo);
    if (userId) params.set('userId', userId);
    if (moduleId) params.set('moduleId', moduleId);
    return params.toString();
}

function normalizeUser(user = {}, fallbackFormatter = null) {
    const userId = text(user.userId || user.user_id || user.id);
    const displayName = text(user.displayName || user.display_name || user.name || fallbackFormatter?.(user) || user.email || userId);
    return {
        userId,
        displayName: displayName || userId,
        role: text(user.role || user.primaryRole || user.primary_role || 'seller')
    };
}

function normalizeModule(module = {}) {
    const moduleId = text(module.moduleId || module.module_id || module.id || module.value);
    const label = text(module.name || module.label || module.displayName || moduleId);
    return { moduleId, label };
}

function aggregateSeries(rows = [], mode = 'day') {
    if (mode === 'day') return toArray(rows);
    const bucketMap = new Map();
    toArray(rows).forEach((row) => {
        const date = text(row?.date).slice(0, 10);
        if (!date) return;
        let key = date;
        if (mode === 'month') key = date.slice(0, 7);
        if (mode === 'week') {
            const parsed = new Date(`${date}T00:00:00Z`);
            const day = parsed.getUTCDay();
            const diff = day === 0 ? -6 : 1 - day;
            parsed.setUTCDate(parsed.getUTCDate() + diff);
            key = parsed.toISOString().slice(0, 10);
        }
        const current = bucketMap.get(key) || { date: key, chatsNuevos: 0, mensajesEnviados: 0, mensajesRecibidos: 0, cotizaciones: 0, tiempoRespuestaPromedio: 0, samples: 0 };
        current.chatsNuevos += number(row.chatsNuevos);
        current.mensajesEnviados += number(row.mensajesEnviados);
        current.mensajesRecibidos += number(row.mensajesRecibidos);
        current.cotizaciones += number(row.cotizaciones);
        current.tiempoRespuestaPromedio += number(row.tiempoRespuestaPromedio);
        current.samples += 1;
        bucketMap.set(key, current);
    });
    return Array.from(bucketMap.values()).map((row) => ({
        ...row,
        tiempoRespuestaPromedio: row.samples > 0 ? row.tiempoRespuestaPromedio / row.samples : 0
    })).sort((a, b) => text(a.date).localeCompare(text(b.date)));
}

function downloadTextFile(fileName, content, mimeType = 'text/plain;charset=utf-8') {
    if (typeof document === 'undefined') return;
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function escapeHtml(value = '') {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function cellValue(row = {}, column = {}) {
    if (typeof column.value === 'function') return column.value(row);
    return row?.[column.key];
}

function buildExportTable({ title = '', subtitle = '', columns = [], rows = [] } = {}) {
    const safeRows = toArray(rows);
    const bodyRows = safeRows.length
        ? safeRows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(cellValue(row, column))}</td>`).join('')}</tr>`).join('')
        : `<tr><td colspan="${Math.max(columns.length, 1)}">Sin datos en este periodo.</td></tr>`;
    return `
      <section class="report-section">
        <h2>${escapeHtml(title)}</h2>
        ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
        <table>
          <thead>
            <tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </section>`;
}

function buildReportExportTables({
    kpis = {},
    previousKpis = {},
    reports = EMPTY_REPORTS,
    temporalRows = [],
    sourceRows = [],
    metaAdRows = [],
    campaignRows = [],
    userLabel = '',
    moduleLabel = ''
} = {}) {
    const funnel = reports.funnel || {};
    const teamRows = toArray(reports.equipo);
    const scheduleHours = toArray(reports.horarios?.porHora);
    const scheduleDays = toArray(reports.horarios?.porDiaSemana);
    const filtersLabel = `${userLabel || 'Todos los usuarios'} - ${moduleLabel || 'Todos los modulos'}`;
    return [
        {
            title: 'Resumen',
            subtitle: filtersLabel,
            columns: [
                { key: 'metric', label: 'Metrica' },
                { key: 'current', label: 'Actual' },
                { key: 'previous', label: 'Periodo anterior' }
            ],
            rows: KPI_DEFS.map((def) => ({
                metric: def.label,
                current: formatKpiValue(kpis?.[def.key], def.type),
                previous: formatKpiValue(previousKpis?.[def.key], def.type)
            }))
        },
        {
            title: 'Embudo de ventas',
            columns: [
                { key: 'stage', label: 'Etapa' },
                { key: 'total', label: 'Total' },
                { key: 'rate', label: 'Conversion' }
            ],
            rows: [
                ...FUNNEL_STAGES.map((stage, index) => {
                    const value = number(funnel?.[stage.key]);
                    const baseKey = stage.rateFromKey || FUNNEL_STAGES[index - 1]?.key;
                    const base = index === 0 ? value : number(funnel?.[baseKey]);
                    const rate = index === 0 ? 'Base' : percent(base > 0 ? (value / base) * 100 : 0, 0);
                    return {
                        stage: stage.label,
                        total: formatInt(value),
                        rate: stage.rateSuffix && index > 0 ? `${rate} ${stage.rateSuffix}` : rate
                    };
                }),
                { stage: 'Tasa aceptacion', total: percent(funnel.tasaAceptacion, 1), rate: 'Aceptado / cotizado' },
                { stage: 'Tasa progresion', total: percent(funnel.tasaProgresion, 1), rate: 'Atendido / aceptado' },
                { stage: 'Proyeccion ventas', total: formatInt(funnel.proyeccionVentas), rate: 'Programado + atendido + vendido' },
                { stage: 'Fuga cotizado a aceptado', total: formatInt(funnel.fugaCotizadoAceptado), rate: 'Pendientes entre cotizado y aceptado' },
                { stage: 'Fuga aceptado a atendido', total: formatInt(funnel.fugaAceptadoAtendido), rate: 'Pendientes entre aceptado y atendido' }
            ]
        },
        {
            title: 'Actividad temporal',
            columns: [
                { key: 'date', label: 'Fecha' },
                { key: 'chatsNuevos', label: 'Chats nuevos' },
                { key: 'mensajesEnviados', label: 'Mensajes enviados' },
                { key: 'mensajesRecibidos', label: 'Mensajes recibidos' },
                { key: 'cotizaciones', label: 'Cotizaciones' },
                { key: 'tiempoRespuestaPromedio', label: 'Tiempo respuesta promedio' }
            ],
            rows: toArray(temporalRows).map((row) => ({
                ...row,
                tiempoRespuestaPromedio: formatKpiValue(row.tiempoRespuestaPromedio, 'minutes')
            }))
        },
        {
            title: 'Equipo',
            columns: [
                { key: 'displayName', label: 'Vendedora' },
                { key: 'chatsAsignados', label: 'Chats asignados' },
                { key: 'chatsAtendidos', label: 'Chats atendidos' },
                { key: 'cotizaciones', label: 'Cotizaciones' },
                { key: 'ventas', label: 'Ventas' },
                { key: 'tiempoRespuesta', label: 'Tiempo respuesta' },
                { key: 'tasaConversion', label: 'Conversion' }
            ],
            rows: teamRows.map((row) => ({
                ...row,
                tiempoRespuesta: formatKpiValue(row.tiempoRespuesta, 'minutes'),
                tasaConversion: percent(row.tasaConversion, 1)
            }))
        },
        {
            title: 'Fuentes de conversaciones',
            columns: [
                { key: 'label', label: 'Fuente' },
                { key: 'source', label: 'Tipo' },
                { key: 'total', label: 'Chats' },
                { key: 'cotizaciones', label: 'Cotizaciones' },
                { key: 'ventas', label: 'Ventas' },
                { key: 'conversion', label: 'Conversion' }
            ],
            rows: toArray(sourceRows).map((row) => ({
                ...row,
                label: row.label || row.source,
                conversion: number(row.total) > 0 ? percent((number(row.ventas) / number(row.total)) * 100, 1) : '0.0%'
            }))
        },
        {
            title: 'Anuncios Meta',
            columns: [
                { key: 'adName', label: 'Anuncio' },
                { key: 'campaignName', label: 'Campana' },
                { key: 'chats', label: 'Chats' },
                { key: 'cotizaciones', label: 'Cotizaciones' },
                { key: 'ventas', label: 'Ventas' },
                { key: 'inversion', label: 'Inversion' },
                { key: 'costoPerChat', label: 'Costo por chat' }
            ],
            rows: toArray(metaAdRows).map((row) => ({
                ...row,
                inversion: formatCurrency(row.inversion),
                costoPerChat: formatCurrency(row.costoPerChat)
            }))
        },
        {
            title: 'Horarios por hora',
            columns: [
                { key: 'hora', label: 'Hora' },
                { key: 'mensajes', label: 'Mensajes' },
                { key: 'chats', label: 'Chats' }
            ],
            rows: scheduleHours
        },
        {
            title: 'Horarios por dia',
            columns: [
                { key: 'dia', label: 'Dia' },
                { key: 'mensajes', label: 'Mensajes' },
                { key: 'chats', label: 'Chats' },
                { key: 'tiempoRespuesta', label: 'Tiempo respuesta' }
            ],
            rows: scheduleDays.map((row) => ({
                ...row,
                tiempoRespuesta: formatKpiValue(row.tiempoRespuesta, 'minutes')
            }))
        },
        {
            title: 'Campanas WhatsApp',
            columns: [
                { key: 'campaignName', label: 'Campana' },
                { key: 'status', label: 'Estado' },
                { key: 'enviados', label: 'Enviados' },
                { key: 'respondieron', label: 'Respondieron' },
                { key: 'cotizaciones', label: 'Cotizaciones' },
                { key: 'cotizados', label: 'Cotizados' },
                { key: 'aceptados', label: 'Aceptados' },
                { key: 'proyeccionVentas', label: 'Proyeccion' },
                { key: 'ventasConfirmadas', label: 'Confirmadas' },
                { key: 'tasaRespuesta', label: 'Tasa respuesta' },
                { key: 'conversionProyeccion', label: 'Conversion proyeccion' },
                { key: 'conversionConfirmada', label: 'Conversion confirmada' }
            ],
            rows: toArray(campaignRows).map((row) => ({
                ...row,
                tasaRespuesta: percent(row.tasaRespuesta, 1),
                conversionProyeccion: percent(row.conversionProyeccion, 1),
                conversionConfirmada: percent(row.conversionConfirmada, 1)
            }))
        }
    ];
}

function buildReportDocumentHtml({ title, subtitle, tables = [], mode = 'print' } = {}) {
    const tableHtml = tables.map(buildExportTable).join('');
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    body { margin: 0; font-family: Arial, sans-serif; color: #111827; background: #fff; }
    main { padding: ${mode === 'print' ? '0' : '20px'}; }
    h1 { margin: 0 0 6px; font-size: 24px; }
    .subtitle { margin: 0 0 18px; color: #4b5563; font-size: 13px; }
    .report-section { page-break-inside: avoid; margin: 0 0 18px; }
    h2 { margin: 0 0 8px; font-size: 16px; color: #0f5132; }
    p { margin: 0 0 8px; color: #4b5563; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; table-layout: auto; }
    th, td { border: 1px solid #d1d5db; padding: 7px 8px; text-align: left; vertical-align: top; font-size: 11px; }
    th { background: #e9f5ee; color: #111827; font-weight: 700; }
    tr:nth-child(even) td { background: #f9fafb; }
    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      main { padding: 0; }
    }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p class="subtitle">${escapeHtml(subtitle)}</p>
    ${tableHtml}
  </main>
</body>
</html>`;
}

function printReportDocument(html = '', fallbackFileName = 'reportes.html') {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        downloadTextFile(fallbackFileName, html, 'text/html;charset=utf-8');
        return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.setTimeout(() => {
        printWindow.print();
    }, 250);
}

function ReportCard({ title, children, subtitle = '', className = '' }) {
    return (
        <section className={`saas-summary-card saas-reports-card ${className}`.trim()}>
            <div className="saas-summary-card__header saas-reports-card__header">
                <h3>{title}</h3>
                {subtitle ? <span>{subtitle}</span> : null}
            </div>
            {children}
        </section>
    );
}

function EmptyState({ text: message = 'Sin datos en este periodo.' }) {
    return <div className="saas-reports-empty">{message}</div>;
}

function KpiCard({ def, current = {}, previous = {} }) {
    const currentValue = number(current?.[def.key]);
    const previousValue = number(previous?.[def.key]);
    const hasPrevious = previousValue !== 0;
    const delta = hasPrevious ? ((currentValue - previousValue) / Math.abs(previousValue)) * 100 : 0;
    const improved = def.improve === 'down' ? delta < 0 : delta > 0;
    const worsened = def.improve === 'down' ? delta > 0 : delta < 0;
    const tone = !hasPrevious || delta === 0 ? 'neutral' : (improved ? 'good' : (worsened ? 'bad' : 'neutral'));
    return (
        <article className={`saas-reports-kpi saas-reports-kpi--${tone}`}>
            <small>{def.label}</small>
            <strong>{formatKpiValue(currentValue, def.type)}</strong>
            <span>{hasPrevious ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}% vs anterior` : 'Sin comparacion previa'}</span>
        </article>
    );
}

function FunnelChart({ data = {} }) {
    const max = Math.max(...FUNNEL_STAGES.map((stage) => number(data?.[stage.key])), 1);
    const projection = number(data?.proyeccionVentas);
    const fugaCotizadoAceptado = number(data?.fugaCotizadoAceptado);
    const fugaAceptadoAtendido = number(data?.fugaAceptadoAtendido);
    return (
        <div className="saas-reports-funnel">
            {FUNNEL_STAGES.map((stage, index) => {
                const value = number(data?.[stage.key]);
                const baseKey = stage.rateFromKey || FUNNEL_STAGES[index - 1]?.key;
                const previous = index === 0 ? value : number(data?.[baseKey]);
                const width = Math.max(5, (value / max) * 100);
                const rate = index === 0 ? 100 : (previous > 0 ? (value / previous) * 100 : 0);
                const rateLabel = index === 0 ? 'Base' : `${percent(rate, 0)}${stage.rateSuffix ? ` ${stage.rateSuffix}` : ''}`;
                return (
                    <div className={`saas-reports-funnel__row ${stage.group === 'negative' ? 'saas-reports-funnel__row--negative' : ''}`} key={stage.key}>
                        <span>{stage.label}</span>
                        <strong>{formatInt(value)}</strong>
                        <div className="saas-reports-funnel__bar">
                            <i style={{ width: `${width}%`, background: stage.color }} />
                        </div>
                        <em>{rateLabel}</em>
                    </div>
                );
            })}
            <div className="saas-reports-funnel__insights">
                <strong>Proyeccion de ventas: {formatInt(projection)} pedidos</strong>
                <span>Programado + atendido + vendido</span>
                <em>Fuga Cotizado-&gt;Aceptado: {formatInt(fugaCotizadoAceptado)} clientes</em>
                <em>Fuga Aceptado-&gt;Atendido: {formatInt(fugaAceptadoAtendido)} clientes</em>
            </div>
        </div>
    );
}

function MultiLineChart({ data = [], lines = [], height = 260 }) {
    const rows = toArray(data);
    const values = rows.flatMap((row) => lines.map((line) => number(row?.[line.key])));
    const max = Math.max(...values, 1);
    const width = 720;
    const padding = { top: 20, right: 18, bottom: 42, left: 42 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const pointFor = (row, index, line) => {
        const x = padding.left + (rows.length <= 1 ? chartWidth / 2 : (index / (rows.length - 1)) * chartWidth);
        const y = padding.top + chartHeight - ((number(row?.[line.key]) / max) * chartHeight);
        return `${x},${y}`;
    };
    if (!rows.length) return <EmptyState />;
    return (
        <div className="saas-reports-linechart">
            <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Grafico de lineas">
                <line x1={padding.left} y1={padding.top + chartHeight} x2={width - padding.right} y2={padding.top + chartHeight} />
                <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + chartHeight} />
                {[0, 0.5, 1].map((ratio) => (
                    <g key={`grid_${ratio}`}>
                        <line className="grid" x1={padding.left} y1={padding.top + chartHeight - (ratio * chartHeight)} x2={width - padding.right} y2={padding.top + chartHeight - (ratio * chartHeight)} />
                        <text x={12} y={padding.top + chartHeight - (ratio * chartHeight) + 4}>{formatInt(max * ratio)}</text>
                    </g>
                ))}
                {lines.map((line) => (
                    <polyline
                        key={line.key}
                        points={rows.map((row, index) => pointFor(row, index, line)).join(' ')}
                        fill="none"
                        stroke={line.color}
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                ))}
                {rows.map((row, index) => (
                    <text key={`label_${row.date}_${index}`} x={padding.left + (rows.length <= 1 ? chartWidth / 2 : (index / (rows.length - 1)) * chartWidth)} y={height - 14} textAnchor="middle">
                        {formatDateShort(row.date)}
                    </text>
                ))}
            </svg>
            <div className="saas-reports-chart-legend">
                {lines.map((line) => (
                    <span key={line.key}><i style={{ background: line.color }} />{line.label}</span>
                ))}
            </div>
        </div>
    );
}

function SimpleBarChart({ rows = [], labelKey = 'label', valueKey = 'value', color = '#1D9E75', horizontal = false }) {
    const items = toArray(rows);
    const max = Math.max(...items.map((row) => number(row?.[valueKey])), 1);
    if (!items.length) return <EmptyState />;
    return (
        <div className={horizontal ? 'saas-reports-bars saas-reports-bars--horizontal' : 'saas-reports-bars'}>
            {items.map((row) => {
                const value = number(row?.[valueKey]);
                const size = Math.max(4, (value / max) * 100);
                return (
                    <div className="saas-reports-bars__item" key={`${row?.[labelKey]}_${value}`}>
                        <span>{row?.[labelKey]}</span>
                        <div className="saas-reports-bars__track">
                            <i style={horizontal ? { width: `${size}%`, background: color } : { height: `${size}%`, background: color }} />
                        </div>
                        <strong>{formatInt(value)}</strong>
                    </div>
                );
            })}
        </div>
    );
}

function DonutChart({ rows = [] }) {
    const items = toArray(rows).filter((row) => number(row.total) > 0);
    const total = items.reduce((acc, row) => acc + number(row.total), 0);
    const colors = ['#1D9E75', '#3b82f6', '#f59e0b', '#ef4444', '#6366f1', '#25d366'];
    let start = 0;
    const gradient = items.map((row, index) => {
        const pct = total > 0 ? (number(row.total) / total) * 100 : 0;
        const end = start + pct;
        const part = `${colors[index % colors.length]} ${start}% ${end}%`;
        start = end;
        return part;
    }).join(', ');
    if (!items.length) return <EmptyState />;
    return (
        <div className="saas-reports-donut-wrap">
            <div className="saas-reports-donut" style={{ background: `conic-gradient(${gradient})` }}>
                <strong>{formatInt(total)}</strong>
                <span>Chats</span>
            </div>
            <div className="saas-reports-donut-legend">
                {items.map((row, index) => (
                    <span key={`${row.source}_${row.label}`}>
                        <i style={{ background: colors[index % colors.length] }} />
                        {row.label || row.source} · {formatInt(row.total)}
                    </span>
                ))}
            </div>
        </div>
    );
}

function TeamHeatmap({ rows = [] }) {
    const users = toArray(rows).slice(0, 8);
    const max = Math.max(...users.flatMap((user) => toArray(user.actividadPorHora).map((item) => number(item.mensajes))), 1);
    if (!users.length) return <EmptyState />;
    return (
        <div className="saas-reports-heatmap" role="img" aria-label="Heatmap de actividad por hora del equipo">
            <div className="saas-reports-heatmap__hours">
                <span />
                {Array.from({ length: 24 }, (_, hour) => <em key={hour}>{hour}</em>)}
            </div>
            {users.map((user) => {
                const hourMap = new Map(toArray(user.actividadPorHora).map((item) => [number(item.hora), number(item.mensajes)]));
                return (
                    <div className="saas-reports-heatmap__row" key={user.userId}>
                        <strong title={user.displayName}>{user.displayName}</strong>
                        {Array.from({ length: 24 }, (_, hour) => {
                            const value = hourMap.get(hour) || 0;
                            const alpha = value > 0 ? Math.max(0.12, value / max) : 0;
                            return <i key={hour} title={`${user.displayName} · ${hour}:00 · ${value} mensajes`} style={{ '--heat': alpha }} />;
                        })}
                    </div>
                );
            })}
        </div>
    );
}

function SortableTeamTable({ rows = [] }) {
    const [sort, setSort] = useState({ key: 'mensajesEnviados', direction: 'desc' });
    const columns = [
        ['displayName', 'Vendedora'],
        ['chatsAsignados', 'Chats'],
        ['chatsAtendidos', 'Respondidos'],
        ['cotizaciones', 'Cotiz.'],
        ['ventas', 'Ventas'],
        ['tiempoRespuesta', 'T.Resp'],
        ['tasaConversion', 'Conversion']
    ];
    const sortedRows = useMemo(() => {
        const dir = sort.direction === 'asc' ? 1 : -1;
        return [...toArray(rows)].sort((a, b) => {
            const left = sort.key === 'displayName' ? text(a?.[sort.key]).toLowerCase() : number(a?.[sort.key]);
            const right = sort.key === 'displayName' ? text(b?.[sort.key]).toLowerCase() : number(b?.[sort.key]);
            if (left < right) return -1 * dir;
            if (left > right) return 1 * dir;
            return 0;
        });
    }, [rows, sort]);
    if (!sortedRows.length) return <EmptyState text="Sin actividad de equipo en este periodo." />;
    const toggleSort = (key) => {
        setSort((prev) => ({
            key,
            direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
        }));
    };
    return (
        <div className="saas-reports-table-wrap">
            <table className="saas-reports-table">
                <thead>
                    <tr>
                        {columns.map(([key, label]) => (
                            <th key={key}>
                                <button type="button" onClick={() => toggleSort(key)}>
                                    {label}{sort.key === key ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                                </button>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {sortedRows.map((row) => (
                        <tr key={row.userId}>
                            <td>
                                <strong>{row.displayName}</strong>
                                <span>{ROLE_LABELS[row.role] || row.role || 'Equipo'}</span>
                            </td>
                            <td>{formatInt(row.chatsAsignados)}</td>
                            <td>{formatInt(row.chatsAtendidos)}</td>
                            <td>{formatInt(row.cotizaciones)}</td>
                            <td>{formatInt(row.ventas)}</td>
                            <td>{formatKpiValue(row.tiempoRespuesta, 'minutes')}</td>
                            <td>{percent(row.tasaConversion, 1)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function AiAnalysisCard({ dateFrom, dateTo, userLabel, moduleLabel }) {
    const [message, setMessage] = useState('');
    return (
        <ReportCard title="Analisis IA del periodo" subtitle="Resumen ejecutivo, alertas y recomendaciones accionables.">
            <div className="saas-reports-ai">
                <div>
                    <p><strong>Periodo:</strong> {formatDateRangeLabel(dateFrom, dateTo)}</p>
                    <p><strong>Filtros:</strong> {userLabel} · {moduleLabel}</p>
                </div>
                <button
                    type="button"
                    className="saas-btn saas-btn--primary"
                    onClick={() => setMessage('El analisis usa OpenAI desde el backend con la configuracion del tenant.')}
                >
                    Analizar
                </button>
                <div className="saas-reports-ai__result">
                    {message || 'El analisis aparecera aqui despues del click. Incluira resumen ejecutivo, puntos fuertes, areas de mejora y recomendaciones concretas.'}
                </div>
            </div>
        </ReportCard>
    );
}

function renderAnalysisLine(line = '', index = 0) {
    const clean = text(line);
    if (!clean) return <br key={`analysis_line_${index}`} />;
    if (clean.startsWith('## ')) {
        return <h4 key={`analysis_line_${index}`}>{clean.replace(/^##\s+/, '')}</h4>;
    }
    if (/^[-*]\s+/.test(clean)) {
        return <p key={`analysis_line_${index}`} className="saas-reports-ai__bullet">{clean.replace(/^[-*]\s+/, '')}</p>;
    }
    if (/^\d+\.\s+/.test(clean)) {
        return <p key={`analysis_line_${index}`} className="saas-reports-ai__bullet">{clean}</p>;
    }
    return <p key={`analysis_line_${index}`}>{clean}</p>;
}

function OpenAiAnalysisCard({ tenantId, dateFrom, dateTo, userId, moduleId, userLabel, moduleLabel, reports, requestJson }) {
    const [analysis, setAnalysis] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const cacheRef = useRef(new Map());
    const reportData = useMemo(() => ({
        kpis: reports?.kpis || null,
        funnel: reports?.funnel || null,
        equipo: reports?.equipo || [],
        origenes: reports?.origenes || { porFuente: [], porAnuncioMeta: [] },
        campanas: reports?.campanas || [],
        actividadDiaria: reports?.actividadDiaria || [],
        horarios: reports?.horarios || { dentroHorario: 0, fueraHorario: 0, porHora: [], porDiaSemana: [] }
    }), [reports]);
    const cacheKey = useMemo(() => JSON.stringify({
        tenantId,
        dateFrom,
        dateTo,
        userId,
        moduleId,
        reportData
    }), [dateFrom, dateTo, moduleId, reportData, tenantId, userId]);

    useEffect(() => {
        setError('');
        setAnalysis(cacheRef.current.get(cacheKey) || '');
    }, [cacheKey]);

    const handleAnalyze = useCallback(async ({ force = false } = {}) => {
        if (!tenantId || typeof requestJson !== 'function') {
            setError('No se pudo iniciar el analisis: falta contexto del tenant.');
            return;
        }
        if (!force && cacheRef.current.has(cacheKey)) {
            setAnalysis(cacheRef.current.get(cacheKey));
            setError('');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const payload = await requestJson('/api/tenant/reports/analyze', {
                method: 'POST',
                tenantIdOverride: tenantId,
                body: {
                    tenantId,
                    dateFrom,
                    dateTo,
                    userId,
                    moduleId,
                    userLabel,
                    moduleLabel,
                    reportData
                }
            });
            const nextAnalysis = text(payload?.analysis) || 'OpenAI no devolvio un analisis para este periodo.';
            cacheRef.current.set(cacheKey, nextAnalysis);
            setAnalysis(nextAnalysis);
        } catch (analysisError) {
            setError(String(analysisError?.message || 'No se pudo generar el analisis IA.'));
        } finally {
            setLoading(false);
        }
    }, [cacheKey, dateFrom, dateTo, moduleId, moduleLabel, reportData, requestJson, tenantId, userId, userLabel]);

    return (
        <ReportCard title="Analisis IA del periodo" subtitle="Resumen ejecutivo, alertas y recomendaciones accionables.">
            <div className="saas-reports-ai">
                <div>
                    <p><strong>Periodo:</strong> {formatDateRangeLabel(dateFrom, dateTo)}</p>
                    <p><strong>Filtros:</strong> {userLabel} - {moduleLabel}</p>
                </div>
                <div className="saas-reports-ai__actions">
                    <button
                        type="button"
                        className="saas-btn saas-btn--primary"
                        onClick={() => handleAnalyze()}
                        disabled={loading || !tenantId}
                    >
                        {loading ? 'Analizando...' : (analysis ? 'Ver analisis cacheado' : 'Analizar')}
                    </button>
                    {analysis ? (
                        <button
                            type="button"
                            className="saas-btn saas-btn--secondary"
                            onClick={() => handleAnalyze({ force: true })}
                            disabled={loading || !tenantId}
                        >
                            Regenerar
                        </button>
                    ) : null}
                </div>
                <div className="saas-reports-ai__result">
                    {error ? <div className="saas-reports-ai__error">{error}</div> : null}
                    {analysis ? (
                        <div className="saas-reports-ai__markdown">
                            {analysis.split('\n').map(renderAnalysisLine)}
                        </div>
                    ) : (
                        <span>El analisis aparecera aqui despues del click. Usara la configuracion OpenAI del tenant y resumira KPIs, embudo, equipo, origenes, campanas y horarios.</span>
                    )}
                </div>
            </div>
        </ReportCard>
    );
}

export default function ReportsDashboardPage(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const {
        isReportsSection = false,
        settingsTenantId = '',
        tenantScopeId = '',
        tenantScopeLocked = false,
        activeTenantLabel = '',
        requestJson = null,
        canViewReports = false,
        users = [],
        waModules = [],
        toUserDisplayName = null
    } = context;
    const tenantId = text(settingsTenantId || tenantScopeId);
    const [preset, setPreset] = useState('7d');
    const [range, setRange] = useState(() => getPresetRange('7d'));
    const [userId, setUserId] = useState('');
    const [moduleId, setModuleId] = useState('');
    const [reports, setReports] = useState(EMPTY_REPORTS);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [exportOpen, setExportOpen] = useState(false);
    const [temporalMode, setTemporalMode] = useState('day');

    const userOptions = useMemo(() => toArray(users)
        .map((user) => normalizeUser(user, toUserDisplayName))
        .filter((user) => user.userId)
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'es')), [toUserDisplayName, users]);
    const moduleOptions = useMemo(() => toArray(waModules)
        .map(normalizeModule)
        .filter((module) => module.moduleId)
        .sort((a, b) => a.label.localeCompare(b.label, 'es')), [waModules]);
    const selectedUserLabel = userId
        ? (userOptions.find((user) => user.userId === userId)?.displayName || 'Usuario seleccionado')
        : 'Todos los usuarios';
    const selectedModuleLabel = moduleId
        ? (moduleOptions.find((module) => module.moduleId === moduleId)?.label || 'Modulo seleccionado')
        : 'Todos los modulos';

    const loadReports = useCallback(async () => {
        if (!isReportsSection || !tenantId || typeof requestJson !== 'function' || !canViewReports || tenantScopeLocked) return;
        const query = buildReportQuery({
            tenantId,
            dateFrom: range.dateFrom,
            dateTo: range.dateTo,
            userId,
            moduleId
        });
        setLoading(true);
        setError('');
        try {
            const entries = await Promise.all(Object.entries(REPORT_ENDPOINTS).map(async ([key, endpoint]) => {
                const response = await requestJson(`${endpoint}?${query}`);
                return [key, response?.data];
            }));
            setReports({ ...EMPTY_REPORTS, ...Object.fromEntries(entries) });
        } catch (loadError) {
            setError(String(loadError?.message || 'No se pudieron cargar los reportes.'));
        } finally {
            setLoading(false);
        }
    }, [canViewReports, isReportsSection, moduleId, range.dateFrom, range.dateTo, requestJson, tenantId, tenantScopeLocked, userId]);

    useEffect(() => {
        void loadReports();
    }, [loadReports]);

    if (!isReportsSection) return null;

    const handlePresetClick = (key) => {
        setPreset(key);
        if (key !== 'custom') setRange(getPresetRange(key));
    };
    const kpis = reports.kpis || {};
    const previousKpis = kpis.kpisPeriodoAnterior || {};
    const temporalRows = aggregateSeries(reports.actividadDiaria, temporalMode);
    const teamBarRows = toArray(reports.equipo).slice(0, 8).map((row) => ({
        label: text(row.displayName).split(' ')[0] || row.userId,
        value: number(row.mensajesEnviados)
    }));
    const sourceRows = toArray(reports.origenes?.porFuente);
    const allMetaAdRows = toArray(reports.origenes?.porAnuncioMeta);
    const metaAdRows = allMetaAdRows.slice(0, 5);
    const campaignRows = toArray(reports.campanas);
    const hourRows = toArray(reports.horarios?.porHora).map((row) => ({ label: `${row.hora}`, value: row.mensajes }));
    const dayRows = toArray(reports.horarios?.porDiaSemana).map((row) => ({ label: row.dia, value: row.mensajes }));
    const buildExportPayload = () => {
        const title = `Reportes ${activeTenantLabel || tenantId || 'Tenant'}`;
        const subtitle = `${formatDateRangeLabel(range.dateFrom, range.dateTo)} - ${selectedUserLabel} - ${selectedModuleLabel}`;
        return {
            title,
            subtitle,
            tables: buildReportExportTables({
                kpis,
                previousKpis,
                reports,
                temporalRows,
                sourceRows,
                metaAdRows: allMetaAdRows,
                campaignRows,
                userLabel: selectedUserLabel,
                moduleLabel: selectedModuleLabel
            })
        };
    };

    const exportJson = () => {
        downloadTextFile(`reportes-${range.dateFrom}-${range.dateTo}.json`, JSON.stringify({
            tenantId,
            tenant: activeTenantLabel,
            filters: { dateFrom: range.dateFrom, dateTo: range.dateTo, userId, moduleId },
            reports
        }, null, 2), 'application/json;charset=utf-8');
        setExportOpen(false);
    };
    const exportExcel = () => {
        const payload = buildExportPayload();
        const html = buildReportDocumentHtml({ ...payload, mode: 'excel' });
        downloadTextFile(
            `reportes-${range.dateFrom}-${range.dateTo}.xls`,
            `\ufeff${html}`,
            'application/vnd.ms-excel;charset=utf-8'
        );
        setExportOpen(false);
    };
    const exportPdf = () => {
        const payload = buildExportPayload();
        const html = buildReportDocumentHtml({ ...payload, mode: 'print' });
        printReportDocument(html, `reportes-${range.dateFrom}-${range.dateTo}.html`);
        setExportOpen(false);
    };

    return (
        <SaasEntityPage
            id="saas_reports"
            sectionKey="reports"
            className="saas-admin-flow-card saas-reports-page"
        >
            <div className="saas-reports-shell">
                <header className="saas-reports-toolbar">
                    <div className="saas-reports-toolbar__title">
                        <strong>Reportes</strong>
                        <span>{activeTenantLabel || tenantId || 'Tenant'} · {formatDateRangeLabel(range.dateFrom, range.dateTo)}</span>
                    </div>
                    <div className="saas-reports-toolbar__controls">
                        <div className="saas-reports-presets" role="group" aria-label="Periodo">
                            {PERIOD_PRESETS.map((item) => (
                                <button
                                    key={item.key}
                                    type="button"
                                    className={preset === item.key ? 'is-active' : ''}
                                    onClick={() => handlePresetClick(item.key)}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                        {preset === 'custom' ? (
                            <div className="saas-reports-date-range">
                                <input className="saas-input" type="date" value={range.dateFrom} onChange={(event) => setRange((prev) => ({ ...prev, dateFrom: event.target.value }))} />
                                <input className="saas-input" type="date" value={range.dateTo} onChange={(event) => setRange((prev) => ({ ...prev, dateTo: event.target.value }))} />
                            </div>
                        ) : null}
                        <select className="saas-input" value={userId} onChange={(event) => setUserId(event.target.value)}>
                            <option value="">Todos los usuarios</option>
                            {userOptions.map((user) => <option key={user.userId} value={user.userId}>{user.displayName}</option>)}
                        </select>
                        <select className="saas-input" value={moduleId} onChange={(event) => setModuleId(event.target.value)}>
                            <option value="">Todos los modulos</option>
                            {moduleOptions.map((module) => <option key={module.moduleId} value={module.moduleId}>{module.label}</option>)}
                        </select>
                        <div className="saas-reports-export">
                            <button type="button" className="saas-btn saas-btn--secondary" onClick={() => setExportOpen((prev) => !prev)}>Exportar</button>
                            {exportOpen ? (
                                <div className="saas-reports-export__menu">
                                    <button type="button" onClick={exportPdf}>PDF</button>
                                    <button type="button" onClick={exportExcel}>Excel</button>
                                    <button type="button" onClick={exportJson}>JSON</button>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </header>

                {!canViewReports ? <EmptyState text="No tienes permiso para ver reportes operativos." /> : null}
                {tenantScopeLocked ? <EmptyState text="Selecciona una empresa para cargar reportes." /> : null}
                {error ? <div className="saas-admin-alert error">{error}</div> : null}
                {loading ? <div className="saas-reports-loading"><span className="loader" />Cargando metricas...</div> : null}

                <section className="saas-reports-kpi-grid" aria-label="KPIs principales">
                    {KPI_DEFS.map((def) => <KpiCard key={def.key} def={def} current={kpis} previous={previousKpis} />)}
                </section>

                <div className="saas-reports-two-col saas-reports-two-col--funnel">
                    <ReportCard title="Embudo de ventas" subtitle="Conversion entre etapas comerciales.">
                        <FunnelChart data={reports.funnel} />
                    </ReportCard>
                    <ReportCard title="Evolucion del embudo" subtitle="Tendencia diaria por estado.">
                        <MultiLineChart data={toArray(reports.funnel?.porDia)} lines={FUNNEL_LINES} />
                    </ReportCard>
                </div>

                <ReportCard title="Actividad del equipo" subtitle="Rendimiento por vendedora y actividad por hora.">
                    <SortableTeamTable rows={reports.equipo} />
                    <div className="saas-reports-two-col">
                        <div>
                            <h4 className="saas-reports-subtitle">Mensajes enviados por equipo</h4>
                            <SimpleBarChart rows={teamBarRows} horizontal color="#3b82f6" />
                        </div>
                        <div>
                            <h4 className="saas-reports-subtitle">Heatmap por hora</h4>
                            <TeamHeatmap rows={reports.equipo} />
                        </div>
                    </div>
                </ReportCard>

                <div className="saas-reports-two-col">
                    <ReportCard title="Origen de conversaciones" subtitle="Fuentes que generan chats y conversion.">
                        <DonutChart rows={sourceRows} />
                    </ReportCard>
                    <ReportCard title="Fuentes y anuncios Meta" subtitle="Tabla de conversion y top anuncios.">
                        <div className="saas-reports-table-wrap">
                            <table className="saas-reports-table">
                                <thead><tr><th>Fuente</th><th>Chats</th><th>Cotiz.</th><th>Ventas</th><th>Conversion</th></tr></thead>
                                <tbody>
                                    {sourceRows.length ? sourceRows.map((row) => {
                                        const conversion = number(row.total) > 0 ? (number(row.ventas) / number(row.total)) * 100 : 0;
                                        return (
                                            <tr key={`${row.source}_${row.label}`}>
                                                <td><strong>{row.label || row.source}</strong><span>{row.source}</span></td>
                                                <td>{formatInt(row.total)}</td>
                                                <td>{formatInt(row.cotizaciones)}</td>
                                                <td>{formatInt(row.ventas)}</td>
                                                <td>{percent(conversion, 1)}</td>
                                            </tr>
                                        );
                                    }) : <tr><td colSpan={5}><EmptyState /></td></tr>}
                                </tbody>
                            </table>
                        </div>
                        {metaAdRows.length ? (
                            <div className="saas-reports-top-ads">
                                <h4 className="saas-reports-subtitle">Top 5 anuncios por chats</h4>
                                {metaAdRows.map((row) => (
                                    <div key={row.adId} className="saas-reports-ad-row">
                                        <strong>{row.adName || row.adId}</strong>
                                        <span>{row.campaignName || 'Sin campana'}</span>
                                        <em>{formatInt(row.chats)} chats · {formatCurrency(row.inversion)} · {formatCurrency(row.costoPerChat)}/chat</em>
                                    </div>
                                ))}
                            </div>
                        ) : null}
                    </ReportCard>
                </div>

                <ReportCard title="Actividad temporal" subtitle="Chats, mensajes y cotizaciones a lo largo del periodo.">
                    <div className="saas-reports-chart-toggle" role="group" aria-label="Agrupar por">
                        {[
                            ['day', 'Dia'],
                            ['week', 'Semana'],
                            ['month', 'Mes']
                        ].map(([key, label]) => (
                            <button key={key} type="button" className={temporalMode === key ? 'is-active' : ''} onClick={() => setTemporalMode(key)}>{label}</button>
                        ))}
                    </div>
                    <MultiLineChart data={temporalRows} lines={TEMPORAL_LINES} height={300} />
                </ReportCard>

                <div className="saas-reports-two-col">
                    <ReportCard title="Distribucion horaria" subtitle={`${formatInt(reports.horarios?.dentroHorario)} mensajes dentro de horario · ${formatInt(reports.horarios?.fueraHorario)} fuera.`}>
                        <SimpleBarChart rows={hourRows} color="#1D9E75" />
                    </ReportCard>
                    <ReportCard title="Actividad por dia de semana" subtitle="Volumen de mensajes por dia operativo.">
                        <SimpleBarChart rows={dayRows} horizontal color="#f59e0b" />
                    </ReportCard>
                </div>

                {campaignRows.length ? (
                    <ReportCard title="Campanas WhatsApp" subtitle="Rendimiento de campanas en el periodo.">
                        <div className="saas-reports-table-wrap">
                            <table className="saas-reports-table">
                                <thead>
                                    <tr>
                                        <th>Campana</th>
                                        <th>Env.</th>
                                        <th>Resp.</th>
                                        <th>Cotiz.</th>
                                        <th>Acept.</th>
                                        <th>Proy.</th>
                                        <th>Conf.</th>
                                        <th>T.Resp.</th>
                                        <th>Conv. proy.</th>
                                        <th>Conv. conf.</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {campaignRows.map((row) => (
                                        <tr key={row.campaignId}>
                                            <td><strong>{row.campaignName}</strong><span>{row.status}</span></td>
                                            <td>{formatInt(row.enviados)}</td>
                                            <td>{formatInt(row.respondieron)}</td>
                                            <td>{formatInt(row.cotizaciones)}</td>
                                            <td>{formatInt(row.aceptados)}</td>
                                            <td>{formatInt(row.proyeccionVentas)}</td>
                                            <td>{formatInt(row.ventasConfirmadas)}</td>
                                            <td>{percent(row.tasaRespuesta, 1)}</td>
                                            <td>{percent(row.conversionProyeccion, 1)}</td>
                                            <td>{percent(row.conversionConfirmada, 1)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </ReportCard>
                ) : null}

                <OpenAiAnalysisCard
                    tenantId={tenantId}
                    dateFrom={range.dateFrom}
                    dateTo={range.dateTo}
                    userId={userId}
                    moduleId={moduleId}
                    userLabel={selectedUserLabel}
                    moduleLabel={selectedModuleLabel}
                    reports={reports}
                    requestJson={requestJson}
                />
            </div>
        </SaasEntityPage>
    );
}
