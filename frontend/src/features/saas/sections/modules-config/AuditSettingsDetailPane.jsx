import React from 'react';
import { Link2 } from 'lucide-react';

const DEFAULT_LIMIT = 100;
const ACTION_META = {
    'ai_assistant.created': { icon: 'AI', label: 'Asistente IA creado', tone: 'success' },
    'ai_assistant.deactivated': { icon: 'AI', label: 'Asistente IA desactivado', tone: 'danger' },
    'ai_assistant.updated': { icon: 'AI', label: 'Asistente IA actualizado', tone: 'info' },
    'auth.device.approved': { icon: 'DEV', label: 'Dispositivo aprobado', tone: 'device' },
    'auth.device.otp_verified': { icon: 'OK', label: 'OTP verificado', tone: 'device' },
    'auth.device.reauth_requested': { icon: 'DEV', label: 'Reautorizacion solicitada', tone: 'device' },
    'auth.device.reauthorized': { icon: 'OK', label: 'Dispositivo reautorizado', tone: 'device' },
    'auth.device.rename': { icon: 'DEV', label: 'Dispositivo renombrado', tone: 'device' },
    'auth.device.revoke': { icon: 'ERR', label: 'Dispositivo revocado', tone: 'device' },
    'auth.device.revoked': { icon: 'DEV', label: 'Dispositivo revocado', tone: 'danger' },
    'auth.login.failed': { icon: 'ERR', label: 'Intento de acceso fallido', tone: 'danger' },
    'auth.login.otp_required': { icon: 'OTP', label: 'OTP requerido por nuevo dispositivo', tone: 'warning' },
    'auth.login.success': { icon: 'OK', label: 'Acceso exitoso', tone: 'success' },
    'auth.logout.all_devices': { icon: 'OUT', label: 'Cierre en todos los dispositivos', tone: 'neutral' },
    'auth.logout.success': { icon: 'OUT', label: 'Cierre de sesion', tone: 'neutral' },
    'auth.otp.resent': { icon: 'OTP', label: 'Codigo OTP reenviado', tone: 'warning' },
    'auth.password.changed': { icon: 'KEY', label: 'Contrasena cambiada', tone: 'warning' },
    'auth.profile.avatar_updated': { icon: 'USR', label: 'Foto de perfil actualizada', tone: 'info' },
    'auth.profile.updated': { icon: 'USR', label: 'Perfil actualizado', tone: 'info' },
    'auth.recovery.request': { icon: 'KEY', label: 'Recuperacion de contrasena solicitada', tone: 'warning' },
    'auth.recovery.reset': { icon: 'KEY', label: 'Contrasena restablecida', tone: 'success' },
    'auth.recovery.verify': { icon: 'KEY', label: 'Codigo de recuperacion verificado', tone: 'success' },
    'auth.tenant.switch.success': { icon: 'CFG', label: 'Cambio de empresa exitoso', tone: 'config' },
    'campaign.cancelled': { icon: 'CAMP', label: 'Campana cancelada', tone: 'campaign' },
    'campaign.create': { icon: 'CAMP', label: 'Campana creada', tone: 'campaign' },
    'campaign.created': { icon: 'CAMP', label: 'Campana creada', tone: 'campaign' },
    'campaign.paused': { icon: 'CAMP', label: 'Campana pausada', tone: 'campaign' },
    'campaign.repaired': { icon: 'CAMP', label: 'Campana reparada', tone: 'campaign' },
    'campaign.resumed': { icon: 'CAMP', label: 'Campana reanudada', tone: 'campaign' },
    'campaign.sent': { icon: 'CAMP', label: 'Campana enviada', tone: 'campaign' },
    'campaign.update_draft': { icon: 'CAMP', label: 'Borrador de campana actualizado', tone: 'campaign' },
    'catalog.created': { icon: 'CAT', label: 'Catalogo creado', tone: 'info' },
    'catalog.synced': { icon: 'CAT', label: 'Catalogo sincronizado', tone: 'info' },
    'catalog.updated': { icon: 'CAT', label: 'Catalogo actualizado', tone: 'info' },
    'chat.assignment.auto.assign': { icon: 'CHAT', label: 'Asignacion automatica de chat', tone: 'chat' },
    'chat.assignment.cleared': { icon: 'CHAT', label: 'Chat liberado', tone: 'chat' },
    'chat.assignment.rule.updated': { icon: 'CHAT', label: 'Regla de asignacion actualizada', tone: 'chat' },
    'chat.assignment.taken': { icon: 'CHAT', label: 'Chat tomado', tone: 'chat' },
    'chat.assignment.updated': { icon: 'CHAT', label: 'Chat reasignado', tone: 'chat' },
    'chat.commercial_status.updated': { icon: 'CHAT', label: 'Estado comercial actualizado', tone: 'chat' },
    'chat.patty_mode.updated': { icon: 'AI', label: 'Modo Patty actualizado', tone: 'info' },
    'chat.state.updated': { icon: 'CHAT', label: 'Estado visual del chat actualizado', tone: 'chat' },
    'config.authorizers.updated': { icon: 'CFG', label: 'Autorizadores actualizados', tone: 'config' },
    'config.brand.updated': { icon: 'CFG', label: 'Identidad de marca actualizada', tone: 'config' },
    'config.email_template.updated': { icon: 'CFG', label: 'Plantilla de correo actualizada', tone: 'config' },
    'config.smtp.updated': { icon: 'CFG', label: 'Correo SMTP actualizado', tone: 'config' },
    'customer.address.updated': { icon: 'CLI', label: 'Direccion de cliente actualizada', tone: 'info' },
    'customer.imported': { icon: 'CLI', label: 'Clientes importados', tone: 'info' },
    'customer.updated': { icon: 'CLI', label: 'Cliente actualizado', tone: 'info' },
    'label.created': { icon: 'TAG', label: 'Etiqueta creada', tone: 'info' },
    'label.updated': { icon: 'TAG', label: 'Etiqueta actualizada', tone: 'info' },
    'meta.template.create': { icon: 'META', label: 'Plantilla Meta creada', tone: 'meta' },
    'meta.template.sync': { icon: 'META', label: 'Plantillas Meta sincronizadas', tone: 'meta' },
    'meta_template.created': { icon: 'META', label: 'Plantilla Meta creada', tone: 'meta' },
    'meta_template.deleted': { icon: 'META', label: 'Plantilla Meta eliminada', tone: 'meta' },
    'meta_template.synced': { icon: 'META', label: 'Plantillas Meta sincronizadas', tone: 'meta' },
    'permission.pack.updated': { icon: 'ROL', label: 'Pack de permisos actualizado', tone: 'config' },
    'plan.updated': { icon: 'CFG', label: 'Plan actualizado', tone: 'config' },
    'product.created': { icon: 'CAT', label: 'Producto creado', tone: 'info' },
    'product.deactivated': { icon: 'CAT', label: 'Producto desactivado', tone: 'danger' },
    'product.updated': { icon: 'CAT', label: 'Producto actualizado', tone: 'info' },
    'quick_reply.created': { icon: 'TAG', label: 'Respuesta rapida creada', tone: 'info' },
    'quick_reply.updated': { icon: 'TAG', label: 'Respuesta rapida actualizada', tone: 'info' },
    'role.created': { icon: 'ROL', label: 'Rol creado', tone: 'config' },
    'role.updated': { icon: 'ROL', label: 'Rol actualizado', tone: 'config' },
    'tenant.created': { icon: 'CFG', label: 'Empresa creada', tone: 'config' },
    'tenant.settings.updated': { icon: 'CFG', label: 'Configuracion general actualizada', tone: 'config' },
    'tenant.updated': { icon: 'CFG', label: 'Empresa actualizada', tone: 'config' },
    'user.created': { icon: 'USR', label: 'Usuario creado', tone: 'success' },
    'user.deactivated': { icon: 'USR', label: 'Usuario desactivado', tone: 'danger' },
    'user.role.changed': { icon: 'USR', label: 'Rol de usuario cambiado', tone: 'config' },
    'wa_module.created': { icon: 'MOD', label: 'Modulo WhatsApp creado', tone: 'device' },
    'wa_module.deactivated': { icon: 'MOD', label: 'Modulo WhatsApp desactivado', tone: 'danger' },
    'wa_module.selected': { icon: 'MOD', label: 'Modulo WhatsApp seleccionado', tone: 'device' },
    'wa_module.updated': { icon: 'MOD', label: 'Modulo WhatsApp actualizado', tone: 'device' },
    'zone.created': { icon: 'ZONA', label: 'Zona creada', tone: 'info' },
    'zone.deleted': { icon: 'ZONA', label: 'Zona eliminada', tone: 'danger' },
    'zone.synced': { icon: 'ZONA', label: 'Zonas sincronizadas', tone: 'info' },
    'zone.updated': { icon: 'ZONA', label: 'Zona actualizada', tone: 'info' }
};

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

function suggestionLabel(user = {}) {
    const displayName = text(user.displayName || user.name || user.userId);
    const email = text(user.email);
    if (displayName && email) return `${displayName} - ${email}`;
    return displayName || email || text(user.userId);
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
    return ACTION_META[normalized] || { icon: 'LOG', label: normalized || 'Evento', tone: 'neutral' };
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

function formatIp(ip = '') {
    const value = text(ip);
    if (!value) return 'WebSocket';
    if (value === '::ffff:127.0.0.1' || value === '127.0.0.1' || value === '::1') return 'Servidor local';
    return value;
}

function truncateText(value = '', max = 30) {
    const clean = text(value);
    if (!clean) return '';
    if (clean.length <= max) return clean;
    return `${clean.slice(0, Math.max(0, max - 3))}...`;
}

function stripEntityTypePrefix(entityType = '', entityId = '') {
    const type = text(entityType).toLowerCase();
    const value = text(entityId);
    if (!type || !value) return value;
    const normalized = value.toLowerCase();
    const prefixes = [`${type}_`, `${type}:`, `${type}.`, `${type}-`];
    const prefix = prefixes.find((item) => normalized.startsWith(item));
    return prefix ? value.slice(prefix.length) : value;
}

function formatChatResource(resourceId = '') {
    const raw = text(resourceId).split('@')[0];
    const digits = raw.replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 11 && digits.startsWith('51')) {
        return `+51 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 11)}`;
    }
    if (digits.length > 2) {
        const country = digits.slice(0, digits.length - 9);
        const local = digits.slice(-9);
        if (country) return `+${country} ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6, 9)}`.trim();
    }
    return digits;
}

function buildEntitySummary(item = {}) {
    const payload = item?.payload && typeof item.payload === 'object' ? item.payload : {};
    const entityType = text(item?.resourceType || item?.entityType).toLowerCase();
    const entityId = stripEntityTypePrefix(entityType, item?.resourceId || item?.entityId || '');
    if (entityType === 'chat') return formatChatResource(entityId) || truncateText(entityId, 30);
    if (entityType === 'campaign') {
        const campaignName = firstPayloadValue(payload, ['campaignName', 'templateName']);
        const nestedCampaignName = compactValue(payload?.newValue?.campaignName || payload?.newValue?.name);
        return campaignName || nestedCampaignName || truncateText(entityId, 30);
    }
    if (entityType === 'auth_device') return firstPayloadValue(payload, ['deviceName', 'deviceType']);
    if (entityType === 'meta_template') return firstPayloadValue(payload, ['templateName', 'deletedTemplateId']) || truncateText(entityId, 30);
    if (entityType === 'auth') return firstPayloadValue(payload, ['deviceName', 'deviceType']);
    return truncateText(entityId, 30);
}

function resolveUserTitle(item = {}) {
    return text(item?.displayName || item?.userEmail || item?.userId || 'Sistema');
}

function resolveUserSubtitle(item = {}) {
    const displayName = text(item?.displayName);
    const userEmail = text(item?.userEmail);
    if (displayName && userEmail && displayName.toLowerCase() !== userEmail.toLowerCase()) return userEmail;
    return '';
}

function buildQuery(filters = {}, offset = 0) {
    const params = new URLSearchParams();
    params.set('limit', String(DEFAULT_LIMIT));
    params.set('offset', String(offset));
    if (text(filters.userSearch)) params.set('userSearch', text(filters.userSearch));
    if (text(filters.action)) params.set('action', text(filters.action));
    if (text(filters.from)) params.set('from', text(filters.from));
    if (text(filters.to)) params.set('to', `${text(filters.to)}T23:59:59`);
    return `/api/audit/logs?${params.toString()}`;
}

function buildUserSearchQuery(search = '') {
    const params = new URLSearchParams();
    params.set('search', text(search));
    params.set('limit', '6');
    return `/api/audit/users?${params.toString()}`;
}

function AuditRow({ item, formatDateTimeLabel }) {
    const payload = item?.payload && typeof item.payload === 'object' ? item.payload : {};
    const meta = actionMeta(item?.action);
    const detail = buildEntitySummary(item);
    const ip = formatIp(item?.ip || payload?.ip);
    const userSubtitle = resolveUserSubtitle(item);
    return (
        <article className="saas-audit-row">
            <div className="saas-audit-row__time">
                <strong>{formatDate(item?.createdAt, formatDateTimeLabel)}</strong>
                {ip === 'WebSocket' ? (
                    <span className="saas-audit-connection">
                        <Link2 size={12} />
                        WebSocket
                    </span>
                ) : (
                    <span>{ip}</span>
                )}
            </div>
            <div className="saas-audit-row__main">
                <span className={`saas-audit-action saas-audit-action--${actionTone(item?.action)}`}>
                    <span className="saas-audit-action__icon">{meta.icon}</span>
                    {actionLabel(item?.action)}
                </span>
                <strong>{resolveUserTitle(item)}</strong>
                {userSubtitle ? <small>{userSubtitle}</small> : null}
            </div>
            <div className="saas-audit-row__payload">{detail || '-'}</div>
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
    const [filters, setFilters] = React.useState({ userSearch: '', action: '', from: '', to: '' });
    const [userSearchInput, setUserSearchInput] = React.useState('');
    const [selectedUser, setSelectedUser] = React.useState(null);
    const [userSuggestions, setUserSuggestions] = React.useState([]);
    const [loadingSuggestions, setLoadingSuggestions] = React.useState(false);
    const [offset, setOffset] = React.useState(0);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState('');

    const isVisible = Boolean(settingsTenantId && isGeneralConfigSection && selectedConfigKey === 'audit_logs' && canViewAuditLogs);
    const currentFilters = React.useMemo(() => ({
        ...filters,
        userSearch: selectedUser?.userId ? text(selectedUser.userId) : text(userSearchInput)
    }), [filters, selectedUser, userSearchInput]);

    const loadLogs = React.useCallback(async (nextOffset = 0, nextFilters = filters) => {
        if (!isVisible || typeof requestJson !== 'function') return;
        setLoading(true);
        setError('');
        try {
            const payload = await requestJson(buildQuery(nextFilters, nextOffset), {
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
    }, [filters, isVisible, requestJson, settingsTenantId]);

    React.useEffect(() => {
        if (!isVisible) return undefined;
        const timer = window.setTimeout(() => {
            void loadLogs(0, filters);
        }, 300);
        return () => window.clearTimeout(timer);
    }, [filters, isVisible, loadLogs]);

    React.useEffect(() => {
        if (!isVisible) return undefined;
        const timer = window.setTimeout(async () => {
            const rawValue = text(userSearchInput);
            if (selectedUser?.userId) {
                setFilters((prev) => (prev.userSearch === selectedUser.userId ? prev : { ...prev, userSearch: selectedUser.userId }));
                setUserSuggestions([]);
                setLoadingSuggestions(false);
                return;
            }

            setFilters((prev) => (prev.userSearch === rawValue ? prev : { ...prev, userSearch: rawValue }));

            if (rawValue.length < 2) {
                setUserSuggestions([]);
                setLoadingSuggestions(false);
                return;
            }

            setLoadingSuggestions(true);
            try {
                const payload = await requestJson(buildUserSearchQuery(rawValue), {
                    method: 'GET',
                    tenantIdOverride: settingsTenantId
                });
                setUserSuggestions(Array.isArray(payload?.items) ? payload.items : []);
            } catch (_) {
                setUserSuggestions([]);
            } finally {
                setLoadingSuggestions(false);
            }
        }, 300);

        return () => window.clearTimeout(timer);
    }, [isVisible, requestJson, selectedUser, settingsTenantId, userSearchInput]);

    const updateFilter = React.useCallback((key, value) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
    }, []);

    const clearUserFilter = React.useCallback(() => {
        setSelectedUser(null);
        setUserSearchInput('');
        setUserSuggestions([]);
        setLoadingSuggestions(false);
        setFilters((prev) => ({ ...prev, userSearch: '' }));
    }, []);

    const selectUserSuggestion = React.useCallback((user = {}) => {
        if (!text(user?.userId)) return;
        setSelectedUser(user);
        setUserSearchInput(suggestionLabel(user));
        setUserSuggestions([]);
        setFilters((prev) => ({ ...prev, userSearch: text(user.userId) }));
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
                    <button type="button" disabled={loading} onClick={() => loadLogs(0, currentFilters)}>
                        Recargar
                    </button>
                </div>
            </div>

            {error ? <div className="saas-admin-error-inline">{error}</div> : null}

            <div className="saas-admin-related-block saas-audit-panel">
                <div className="saas-audit-filters">
                    <div className="saas-audit-user-search">
                        <input
                            value={userSearchInput}
                            onChange={(event) => {
                                setSelectedUser(null);
                                setUserSearchInput(event.target.value);
                            }}
                            placeholder="Nombre, email o ID..."
                            aria-label="Buscar usuario"
                        />
                        {text(userSearchInput) ? (
                            <button type="button" className="saas-audit-user-search__clear" onClick={clearUserFilter} aria-label="Limpiar filtro de usuario">
                                X
                            </button>
                        ) : null}
                        {loadingSuggestions || userSuggestions.length ? (
                            <div className="saas-audit-user-search__suggestions">
                                {loadingSuggestions ? <div className="saas-audit-user-search__empty">Buscando usuarios...</div> : null}
                                {userSuggestions.map((user) => (
                                    <button
                                        key={user.userId}
                                        type="button"
                                        className="saas-audit-user-search__option"
                                        onClick={() => selectUserSuggestion(user)}
                                    >
                                        <span>USR {text(user.displayName || user.userId)}</span>
                                        <small>{text(user.email)}</small>
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </div>
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
                    <button type="button" disabled={loading} onClick={() => loadLogs(0, currentFilters)}>
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
                    <button type="button" disabled={loading || offset <= 0} onClick={() => loadLogs(Math.max(0, offset - DEFAULT_LIMIT), currentFilters)}>
                        Anterior
                    </button>
                    <span>Mostrando {offset + 1}-{offset + items.length}</span>
                    <button type="button" disabled={loading || items.length < DEFAULT_LIMIT} onClick={() => loadLogs(offset + DEFAULT_LIMIT, currentFilters)}>
                        Siguiente
                    </button>
                </div>
            </div>
        </>
    );
}
