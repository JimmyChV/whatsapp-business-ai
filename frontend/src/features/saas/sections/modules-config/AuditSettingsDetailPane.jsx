import React from 'react';

const DEFAULT_LIMIT = 100;

function text(value = '') {
    return String(value || '').trim();
}

function formatDate(value, formatDateTimeLabel) {
    if (!value) return '-';
    if (typeof formatDateTimeLabel === 'function') return formatDateTimeLabel(value);
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('es-PE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function actionLabel(action = '') {
    const normalized = text(action);
    return actionMeta(normalized).label;
}

function actionTone(action = '') {
    return actionMeta(action).tone;
}

function actionMeta(action = '') {
    const normalized = text(action);
    const labels = {
        'auth.login.success': ['Acceso exitoso', 'success', 'OK'],
        'auth.login.failed': ['Acceso fallido', 'danger', 'ERR'],
        'auth.logout': ['Cierre de sesion', 'neutral', 'OUT'],
        'auth.logout.success': ['Cierre de sesion', 'neutral', 'OUT'],
        'auth.logout.all_devices': ['Cierre global de sesiones', 'danger', 'LOCK'],
        'auth.password.changed': ['Contrasena cambiada', 'success', 'KEY'],
        'auth.otp.sent': ['OTP enviado', 'info', 'OTP'],
        'auth.otp.resent': ['OTP reenviado', 'info', 'OTP'],
        'auth.otp.verified': ['OTP verificado', 'success', 'OTP'],
        'auth.device.approved': ['Dispositivo aprobado', 'success', 'DEV'],
        'auth.device.revoked': ['Dispositivo revocado', 'danger', 'DEV'],
        'auth.device.reauth_requested': ['Reautorizacion solicitada', 'info', 'DEV'],
        'auth.device.reauthorized': ['Dispositivo reautorizado', 'success', 'DEV'],
        'auth.device.rename': ['Dispositivo renombrado', 'neutral', 'DEV'],
        'auth.device.otp_verified': ['OTP de dispositivo verificado', 'success', 'OTP'],
        'role.created': ['Rol creado', 'success', 'ROL'],
        'role.updated': ['Rol actualizado', 'info', 'ROL'],
        'permission.pack.updated': ['Permisos actualizados', 'info', 'PERM'],
        'plan.updated': ['Plan actualizado', 'info', 'PLAN'],
        'user.created': ['Usuario creado', 'success', 'USR'],
        'user.updated': ['Usuario actualizado', 'info', 'USR'],
        'user.deactivated': ['Usuario desactivado', 'danger', 'USR'],
        'user.role.changed': ['Rol de usuario cambiado', 'info', 'USR'],
        'tenant.created': ['Empresa creada', 'success', 'EMP'],
        'tenant.updated': ['Empresa actualizada', 'info', 'EMP'],
        'config.smtp.updated': ['SMTP actualizado', 'info', 'MAIL'],
        'config.authorizers.updated': ['Autorizadores actualizados', 'info', 'OTP'],
        'config.email_template.updated': ['Plantilla de correo actualizada', 'info', 'MAIL'],
        'config.brand.updated': ['Identidad de marca actualizada', 'info', 'BRAND'],
        'ai_assistant.created': ['Asistente IA creado', 'success', 'IA'],
        'ai_assistant.updated': ['Asistente IA actualizado', 'info', 'IA'],
        'ai_assistant.deactivated': ['Asistente IA desactivado', 'danger', 'IA'],
        'wa_module.created': ['Modulo WhatsApp creado', 'success', 'MOD'],
        'wa_module.updated': ['Modulo WhatsApp actualizado', 'info', 'MOD'],
        'wa_module.deactivated': ['Modulo WhatsApp desactivado', 'danger', 'MOD'],
        'wa_module.selected': ['Modulo WhatsApp seleccionado', 'neutral', 'MOD'],
        'catalog.created': ['Catalogo creado', 'success', 'CAT'],
        'catalog.updated': ['Catalogo actualizado', 'info', 'CAT'],
        'catalog.synced': ['Catalogo sincronizado', 'info', 'CAT'],
        'product.created': ['Producto creado', 'success', 'PROD'],
        'product.updated': ['Producto actualizado', 'info', 'PROD'],
        'product.deactivated': ['Producto desactivado', 'danger', 'PROD'],
        'customer.created': ['Cliente creado', 'success', 'CLI'],
        'customer.updated': ['Cliente actualizado', 'info', 'CLI'],
        'customer.imported': ['Clientes importados', 'info', 'CLI'],
        'customer.address.updated': ['Direccion de cliente actualizada', 'info', 'DIR'],
        'zone.created': ['Zona creada', 'success', 'ZONA'],
        'zone.updated': ['Zona actualizada', 'info', 'ZONA'],
        'zone.deleted': ['Zona eliminada', 'danger', 'ZONA'],
        'zone.synced': ['Zonas sincronizadas', 'info', 'ZONA'],
        'label.created': ['Etiqueta creada', 'success', 'TAG'],
        'label.updated': ['Etiqueta actualizada', 'info', 'TAG'],
        'quick_reply.created': ['Respuesta rapida creada', 'success', 'QR'],
        'quick_reply.updated': ['Respuesta rapida actualizada', 'info', 'QR'],
        'campaign.created': ['Campana creada', 'success', 'CAMP'],
        'campaign.sent': ['Campana enviada', 'success', 'CAMP'],
        'campaign.paused': ['Campana pausada', 'info', 'CAMP'],
        'campaign.resumed': ['Campana reanudada', 'success', 'CAMP'],
        'campaign.cancelled': ['Campana cancelada', 'danger', 'CAMP'],
        'campaign.repaired': ['Historial de campana reparado', 'info', 'CAMP'],
        'chat.assignment.taken': ['Chat tomado', 'success', 'CHAT'],
        'chat.assignment.updated': ['Chat reasignado', 'info', 'CHAT'],
        'chat.assignment.cleared': ['Chat liberado', 'neutral', 'CHAT'],
        'chat.commercial_status.updated': ['Estado comercial actualizado', 'info', 'CHAT'],
        'chat.patty_mode.updated': ['Modo Patty actualizado', 'info', 'IA'],
        'meta_template.created': ['Plantilla Meta creada', 'success', 'META'],
        'meta_template.updated': ['Plantilla Meta actualizada', 'info', 'META'],
        'meta_template.deleted': ['Plantilla Meta eliminada', 'danger', 'META'],
        'meta_template.synced': ['Plantillas Meta sincronizadas', 'info', 'META'],
        'meta.template.create': ['Plantilla Meta creada', 'success', 'META'],
        'meta.template.delete': ['Plantilla Meta eliminada', 'danger', 'META'],
        'meta.template.sync': ['Plantillas Meta sincronizadas', 'info', 'META']
    };
    const entry = labels[normalized];
    if (entry) return { label: entry[0], tone: entry[1], icon: entry[2] };
    if (normalized.includes('failed') || normalized.includes('revoked') || normalized.includes('revoke')) return { label: normalized || 'Evento', tone: 'danger', icon: 'ERR' };
    if (normalized.includes('login') || normalized.includes('verified') || normalized.includes('created')) return { label: normalized || 'Evento', tone: 'success', icon: 'OK' };
    if (normalized.includes('campaign')) return { label: normalized || 'Evento', tone: 'info', icon: 'CAMP' };
    return { label: normalized || 'Evento', tone: 'neutral', icon: 'LOG' };
}

function compactValue(value) {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'boolean') return value ? 'si' : 'no';
    if (Array.isArray(value)) return `${value.length} items`;
    if (typeof value === 'object') {
        return text(value.name || value.displayName || value.email || value.id || value.userId || value.deviceName || value.templateName || '');
    }
    return text(value);
}

function firstPayloadValue(payload = {}, keys = []) {
    for (const key of keys) {
        const value = compactValue(payload?.[key]);
        if (value) return value;
    }
    return '';
}

function buildAuditDetail(item = {}) {
    const payload = item?.payload && typeof item.payload === 'object' ? item.payload : {};
    const resource = firstPayloadValue(payload, [
        'deviceName', 'targetUserEmail', 'targetUserId', 'userEmail', 'displayName',
        'catalogName', 'productName', 'templateName', 'assistantName', 'moduleName',
        'campaignName', 'customerName', 'labelName', 'quickReplyLabel', 'zoneName'
    ]);
    const oldValue = firstPayloadValue(payload, ['previousMode', 'previousStatus', 'previousAssigneeUserId', 'oldRole', 'oldValue']);
    const newValue = firstPayloadValue(payload, ['nextMode', 'nextStatus', 'nextAssigneeUserId', 'newRole', 'newValue', 'status']);
    const count = firstPayloadValue(payload, ['count', 'imported', 'totalSynced', 'recipients', 'queued', 'repaired']);
    const reason = firstPayloadValue(payload, ['reason']);
    const pieces = [];
    if (resource) pieces.push(resource);
    if (oldValue || newValue) pieces.push(`${oldValue || '-'} -> ${newValue || '-'}`);
    if (count) pieces.push(`${count} registros`);
    if (reason) pieces.push(`Motivo: ${reason}`);
    if (!pieces.length && item?.resourceId) pieces.push(`${item.resourceType || 'Recurso'} ${item.resourceId}`);
    return pieces.join(' · ') || 'Sin detalle adicional';
}

function buildQuery(filters = {}, offset = 0) {
    const params = new URLSearchParams();
    params.set('limit', String(DEFAULT_LIMIT));
    params.set('offset', String(offset));
    if (text(filters.userId)) params.set('userId', text(filters.userId));
    if (text(filters.action)) params.set('action', text(filters.action));
    if (text(filters.from)) params.set('from', text(filters.from));
    if (text(filters.to)) params.set('to', `${text(filters.to)}T23:59:59`);
    return `/api/audit/logs?${params.toString()}`;
}

function AuditRow({ item, formatDateTimeLabel }) {
    const payload = item?.payload && typeof item.payload === 'object' ? item.payload : {};
    const entityType = item?.resourceType || item?.entityType || '-';
    const entityId = item?.resourceId || item?.entityId || '-';
    const meta = actionMeta(item?.action);
    const detail = buildAuditDetail(item);
    return (
        <article className="saas-audit-row">
            <div className="saas-audit-row__time">
                <strong>{formatDate(item?.createdAt, formatDateTimeLabel)}</strong>
                <span>{item?.ip || payload?.ip || 'IP no disponible'}</span>
            </div>
            <div className="saas-audit-row__main">
                <span className={`saas-audit-action saas-audit-action--${actionTone(item?.action)}`}>
                    <span className="saas-audit-action__icon">{meta.icon}</span>
                    {actionLabel(item?.action)}
                </span>
                <strong>{item?.userEmail || item?.userId || 'Sistema'}</strong>
                <small>{entityType}{entityId !== '-' ? ` - ${entityId}` : ''}</small>
            </div>
            <div className="saas-audit-row__payload">{detail}</div>
        </article>
    );
}

export default function AuditSettingsDetailPane({
    settingsTenantId,
    isGeneralConfigSection,
    selectedConfigKey,
    requestJson,
    formatDateTimeLabel,
    canViewAuditLogs = false
}) {
    const [items, setItems] = React.useState([]);
    const [filters, setFilters] = React.useState({ userId: '', action: '', from: '', to: '' });
    const [offset, setOffset] = React.useState(0);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState('');

    const isVisible = Boolean(settingsTenantId && isGeneralConfigSection && selectedConfigKey === 'audit_logs' && canViewAuditLogs);

    const loadLogs = React.useCallback(async (nextOffset = offset) => {
        if (!isVisible || typeof requestJson !== 'function') return;
        setLoading(true);
        setError('');
        try {
            const payload = await requestJson(buildQuery(filters, nextOffset), {
                method: 'GET',
                tenantIdOverride: settingsTenantId
            });
            setItems(Array.isArray(payload?.items) ? payload.items : []);
            setOffset(nextOffset);
        } catch (err) {
            setError(String(err?.message || err || 'No se pudo cargar la auditoria.'));
        } finally {
            setLoading(false);
        }
    }, [filters, isVisible, offset, requestJson, settingsTenantId]);

    React.useEffect(() => {
        void loadLogs(0);
    }, [loadLogs]);

    const updateFilter = React.useCallback((key, value) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
    }, []);

    if (!isVisible) return null;

    return (
        <>
            <div className="saas-admin-pane-header">
                <div>
                    <h3>Auditoria</h3>
                    <small>Eventos sensibles de acceso, dispositivos, campanas y cambios operativos.</small>
                </div>
                <div className="saas-admin-list-actions saas-admin-list-actions--row">
                    <button type="button" disabled={loading} onClick={() => loadLogs(0)}>
                        Recargar
                    </button>
                </div>
            </div>

            {error ? <div className="saas-admin-error-inline">{error}</div> : null}

            <div className="saas-admin-related-block saas-audit-panel">
                <div className="saas-audit-filters">
                    <input
                        value={filters.userId}
                        onChange={(event) => updateFilter('userId', event.target.value)}
                        placeholder="Filtrar por user_id"
                    />
                    <input
                        value={filters.action}
                        onChange={(event) => updateFilter('action', event.target.value)}
                        placeholder="Accion exacta"
                    />
                    <input
                        type="date"
                        value={filters.from}
                        onChange={(event) => updateFilter('from', event.target.value)}
                    />
                    <input
                        type="date"
                        value={filters.to}
                        onChange={(event) => updateFilter('to', event.target.value)}
                    />
                    <button type="button" disabled={loading} onClick={() => loadLogs(0)}>
                        Aplicar
                    </button>
                </div>

                {loading ? (
                    <div className="saas-admin-empty-inline">Cargando auditoria...</div>
                ) : items.length ? (
                    <div className="saas-audit-list">
                        {items.map((item) => (
                            <AuditRow key={item.id} item={item} formatDateTimeLabel={formatDateTimeLabel} />
                        ))}
                    </div>
                ) : (
                    <div className="saas-admin-empty-inline">No hay eventos con estos filtros.</div>
                )}

                <div className="saas-audit-pagination">
                    <button type="button" disabled={loading || offset <= 0} onClick={() => loadLogs(Math.max(0, offset - DEFAULT_LIMIT))}>
                        Anterior
                    </button>
                    <span>Mostrando {offset + 1}-{offset + items.length}</span>
                    <button type="button" disabled={loading || items.length < DEFAULT_LIMIT} onClick={() => loadLogs(offset + DEFAULT_LIMIT)}>
                        Siguiente
                    </button>
                </div>
            </div>
        </>
    );
}
