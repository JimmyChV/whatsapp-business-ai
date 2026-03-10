import { useEffect, useMemo, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const EMPTY_TENANT_FORM = {
    id: '',
    slug: '',
    name: '',
    plan: 'starter'
};

const EMPTY_USER_FORM = {
    id: '',
    email: '',
    name: '',
    password: '',
    tenantId: '',
    role: 'seller'
};

const EMPTY_SETTINGS = {
    catalogMode: 'hybrid',
    enabledModules: {
        aiPro: true,
        catalog: true,
        cart: true,
        quickReplies: true
    }
};

const EMPTY_WA_MODULE_FORM = {
    moduleId: '',
    name: '',
    phoneNumber: '',
    transportMode: 'webjs',
    assignedUserIds: ''
};

const ROLE_OPTIONS = ['owner', 'admin', 'seller'];
const PLAN_OPTIONS = ['starter', 'pro', 'enterprise'];
const CATALOG_MODE_OPTIONS = ['hybrid', 'woo_only', 'local_only'];
const MODULE_KEYS = [
    { key: 'aiPro', label: 'IA Pro' },
    { key: 'catalog', label: 'Catalogo' },
    { key: 'cart', label: 'Carrito' },
    { key: 'quickReplies', label: 'Respuestas rapidas' }
];
const ADMIN_NAV_ITEMS = [
    { id: 'saas_resumen', label: 'Resumen' },
    { id: 'saas_empresas', label: 'Empresas' },
    { id: 'saas_usuarios', label: 'Usuarios' },
    { id: 'saas_config', label: 'Configuracion' }
];

function normalizeOverview(payload = {}) {
    return {
        tenants: Array.isArray(payload?.tenants) ? payload.tenants : [],
        users: Array.isArray(payload?.users) ? payload.users : [],
        metrics: Array.isArray(payload?.metrics) ? payload.metrics : [],
        aiUsage: Array.isArray(payload?.aiUsage) ? payload.aiUsage : []
    };
}

function sanitizeMemberships(memberships = []) {
    return (Array.isArray(memberships) ? memberships : [])
        .map((entry) => ({
            tenantId: String(entry?.tenantId || '').trim(),
            role: ROLE_OPTIONS.includes(String(entry?.role || '').trim().toLowerCase())
                ? String(entry?.role || '').trim().toLowerCase()
                : 'seller',
            active: entry?.active !== false
        }))
        .filter((entry) => entry.tenantId);
}


function parseAssignedUserIds(value = '') {
    return String(value || '')
        .split(',')
        .map((entry) => String(entry || '').trim())
        .filter(Boolean);
}

function normalizeWaModule(item = {}) {
    const source = item && typeof item === 'object' ? item : {};
    const moduleId = String(source.moduleId || source.id || '').trim().toLowerCase();
    if (!moduleId) return null;
    return {
        moduleId,
        name: String(source.name || moduleId).trim() || moduleId,
        phoneNumber: String(source.phoneNumber || '').trim() || '',
        transportMode: String(source.transportMode || source.mode || 'webjs').trim().toLowerCase() === 'cloud' ? 'cloud' : 'webjs',
        isActive: source.isActive !== false,
        isDefault: source.isDefault === true,
        isSelected: source.isSelected === true,
        assignedUserIds: Array.isArray(source.assignedUserIds)
            ? source.assignedUserIds.map((entry) => String(entry || '').trim()).filter(Boolean)
            : []
    };
}

export default function SaasAdminPanel({
    isOpen = false,
    onClose,
    onOpenWhatsAppOperation,
    buildApiHeaders,
    activeTenantId = '',
    canManageSaas = false,
    initialSection = 'saas_resumen',
    userRole = 'seller',
    isSuperAdmin = false,
    embedded = false,
    activeSection = '',
    showNavigation = true,
    showHeader = true,
}) {
    const [overview, setOverview] = useState({ tenants: [], users: [], metrics: [], aiUsage: [] });
    const [tenantForm, setTenantForm] = useState(EMPTY_TENANT_FORM);
    const [userForm, setUserForm] = useState(EMPTY_USER_FORM);
    const [settingsTenantId, setSettingsTenantId] = useState('');
    const [tenantSettings, setTenantSettings] = useState(EMPTY_SETTINGS);
    const [editingMembershipUserId, setEditingMembershipUserId] = useState('');
    const [membershipDraft, setMembershipDraft] = useState([]);
    const [waModules, setWaModules] = useState([]);
    const [waModuleForm, setWaModuleForm] = useState(EMPTY_WA_MODULE_FORM);
    const [editingWaModuleId, setEditingWaModuleId] = useState('');

    const [busy, setBusy] = useState(false);
    const [loadingSettings, setLoadingSettings] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [currentSection, setCurrentSection] = useState(String(activeSection || initialSection || 'saas_resumen'));

    const normalizedRole = String(userRole || '').trim().toLowerCase();
    const noRoleContext = !normalizedRole;
    const canManageTenants = Boolean(isSuperAdmin || normalizedRole === 'superadmin' || noRoleContext);
    const canManageUsers = Boolean(isSuperAdmin || normalizedRole === 'superadmin' || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const canManageTenantSettings = canManageUsers;
    const roleOptions = (isSuperAdmin || normalizedRole === 'superadmin' || noRoleContext) ? ROLE_OPTIONS : ROLE_OPTIONS.filter((role) => role !== 'owner');

    const requestJson = async (path, { method = 'GET', body = null } = {}) => {
        const response = await fetch(`${API_BASE}${path}`, {
            method,
            headers: buildApiHeaders?.({ includeJson: body !== null }) || (body !== null ? { 'Content-Type': 'application/json' } : {}),
            body: body !== null ? JSON.stringify(body) : undefined
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
            throw new Error(String(payload?.error || 'Operacion fallida.'));
        }
        return payload;
    };

    const aiUsageByTenant = useMemo(() => {
        const map = new Map();
        (overview.aiUsage || []).forEach((entry) => {
            const tenantId = String(entry?.tenantId || '').trim();
            if (!tenantId) return;
            map.set(tenantId, Number(entry?.requests || 0) || 0);
        });
        return map;
    }, [overview]);

    const tenantOptions = useMemo(() => {
        return [...(overview.tenants || [])].sort((a, b) => String(a?.name || a?.id || '').localeCompare(String(b?.name || b?.id || ''), 'es', { sensitivity: 'base' }));
    }, [overview.tenants]);

    const adminNavItems = useMemo(() => {
        return ADMIN_NAV_ITEMS.filter((item) => {
            if (item.id === 'saas_empresas') return canManageTenants;
            if (item.id === 'saas_usuarios') return canManageUsers;
            if (item.id === 'saas_config') return canManageTenantSettings;
            return true;
        });
    }, [canManageTenants, canManageUsers, canManageTenantSettings]);

    const selectedSectionId = (() => {
        const preferred = String(currentSection || activeSection || initialSection || 'saas_resumen').trim();
        if (adminNavItems.some((item) => item.id === preferred)) return preferred;
        return adminNavItems[0]?.id || 'saas_resumen';
    })();

    const scrollToSection = (sectionId, behavior = 'smooth') => {
        const cleanSection = String(sectionId || '').trim();
        if (!cleanSection) return;
        const node = document.getElementById(cleanSection);
        if (node && typeof node.scrollIntoView === 'function') {
            node.scrollIntoView({ behavior, block: 'start' });
        }
    };

    const refreshOverview = async () => {
        const payload = await requestJson('/api/admin/saas/overview');
        const next = normalizeOverview(payload);
        setOverview(next);
        if (!settingsTenantId && next.tenants.length > 0) {
            const fallbackTenant = String(activeTenantId || next.tenants[0]?.id || '').trim();
            setSettingsTenantId(fallbackTenant || String(next.tenants[0]?.id || '').trim());
        }
    };

    const loadTenantSettings = async (tenantId) => {
        const cleanTenantId = String(tenantId || '').trim();
        if (!cleanTenantId) {
            setTenantSettings(EMPTY_SETTINGS);
            return;
        }
        setLoadingSettings(true);
        try {
            const payload = await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/settings`);
            const settings = payload?.settings && typeof payload.settings === 'object' ? payload.settings : {};
            setTenantSettings({
                catalogMode: CATALOG_MODE_OPTIONS.includes(String(settings.catalogMode || '').trim())
                    ? String(settings.catalogMode).trim()
                    : 'hybrid',
                enabledModules: {
                    aiPro: settings?.enabledModules?.aiPro !== false,
                    catalog: settings?.enabledModules?.catalog !== false,
                    cart: settings?.enabledModules?.cart !== false,
                    quickReplies: settings?.enabledModules?.quickReplies !== false
                }
            });
        } finally {
            setLoadingSettings(false);
        }
    };

    const loadWaModules = async (tenantId) => {
        const cleanTenantId = String(tenantId || '').trim();
        if (!cleanTenantId) {
            setWaModules([]);
            return;
        }
        const payload = await requestJson('/api/admin/saas/tenants/' + encodeURIComponent(cleanTenantId) + '/wa-modules');
        const items = (Array.isArray(payload?.items) ? payload.items : [])
            .map(normalizeWaModule)
            .filter(Boolean)
            .sort((a, b) => String(a.name || a.moduleId).localeCompare(String(b.name || b.moduleId), 'es', { sensitivity: 'base' }));
        setWaModules(items);
    };

    const resetWaModuleForm = () => {
        setWaModuleForm(EMPTY_WA_MODULE_FORM);
        setEditingWaModuleId('');
    };

    const openWaModuleEditor = (moduleItem = null) => {
        const item = normalizeWaModule(moduleItem || {});
        if (!item) {
            resetWaModuleForm();
            return;
        }
        setEditingWaModuleId(item.moduleId);
        setWaModuleForm({
            moduleId: item.moduleId,
            name: item.name,
            phoneNumber: item.phoneNumber || '',
            transportMode: item.transportMode || 'webjs',
            assignedUserIds: (item.assignedUserIds || []).join(', ')
        });
    };
    const runAction = async (label, action) => {
        setError('');
        setNotice('');
        setBusy(true);
        try {
            await action();
            await refreshOverview();
            if (settingsTenantId) {
                await loadTenantSettings(settingsTenantId);
                await loadWaModules(settingsTenantId);
            }
            setNotice(`${label} completado.`);
        } catch (err) {
            setError(String(err?.message || err || 'Error inesperado.'));
        } finally {
            setBusy(false);
        }
    };

    const handleOpenOperation = (moduleId = '') => {
        if (typeof onOpenWhatsAppOperation !== 'function') return;
        const cleanModuleId = String(moduleId || '').trim();
        const cleanTenantId = String(settingsTenantId || activeTenantId || '').trim();
        onOpenWhatsAppOperation(cleanModuleId, { tenantId: cleanTenantId || undefined });
    };
    const openMembershipEditor = (user) => {
        const cleanUserId = String(user?.id || '').trim();
        if (!cleanUserId) return;
        if (editingMembershipUserId === cleanUserId) {
            setEditingMembershipUserId('');
            setMembershipDraft([]);
            return;
        }
        setEditingMembershipUserId(cleanUserId);
        setMembershipDraft(sanitizeMemberships(user?.memberships || []));
    };

    const updateMembershipDraft = (index, patch = {}) => {
        setMembershipDraft((prev) => prev.map((entry, entryIndex) => {
            if (entryIndex !== index) return entry;
            return {
                ...entry,
                ...patch,
                role: ROLE_OPTIONS.includes(String(patch?.role || entry.role || '').trim().toLowerCase())
                    ? String(patch?.role || entry.role).trim().toLowerCase()
                    : 'seller'
            };
        }));
    };

    const removeMembershipDraft = (index) => {
        setMembershipDraft((prev) => prev.filter((_, entryIndex) => entryIndex !== index));
    };

    const addMembershipDraft = () => {
        const fallbackTenant = String(settingsTenantId || tenantOptions[0]?.id || '').trim();
        setMembershipDraft((prev) => [
            ...prev,
            { tenantId: fallbackTenant, role: 'seller', active: true }
        ]);
    };

    useEffect(() => {
        if (!isOpen || !canManageSaas) return;
        runAction('Carga inicial', async () => {
            await refreshOverview();
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, canManageSaas]);

    useEffect(() => {
        if (!isOpen || embedded) return;
        const onKeyDown = (event) => {
            if (event.key === 'Escape') onClose?.();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [embedded, isOpen, onClose]);

    useEffect(() => {
        if (!isOpen || !canManageSaas || !settingsTenantId) return;
        Promise.all([
            loadTenantSettings(settingsTenantId),
            loadWaModules(settingsTenantId)
        ]).catch((err) => {
            setError(String(err?.message || err || 'No se pudo cargar configuracion del tenant.'));
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, canManageSaas, settingsTenantId]);

    useEffect(() => {
        if (!isOpen || !canManageSaas) return;
        const sectionId = String(initialSection || '').trim();
        if (!sectionId) return;
        setCurrentSection(sectionId);
    }, [isOpen, canManageSaas, initialSection]);

    useEffect(() => {
        const next = String(activeSection || '').trim();
        if (!next) return;
        setCurrentSection(next);
    }, [activeSection]);

    if (!isOpen) return null;

    if (!canManageSaas) {
        return (
            <div className={embedded ? "saas-admin-overlay saas-admin-overlay--embedded" : "saas-admin-overlay"} onClick={() => { if (!embedded) onClose?.(); }}>
                <div className={embedded ? "saas-admin-panel saas-admin-panel--embedded" : "saas-admin-panel"} onClick={(event) => event.stopPropagation()}>
                    {showHeader && (
                        <div className="saas-admin-header">
                            <h2>Panel SaaS</h2>
                            {!embedded && <button type="button" onClick={() => onClose?.()}>Cerrar</button>}
                        </div>
                    )}
                    <p>No tienes permisos para administrar empresas y usuarios.</p>
                </div>
            </div>
        );
    }

    return (
        <div className={embedded ? "saas-admin-overlay saas-admin-overlay--embedded" : "saas-admin-overlay"} onClick={() => { if (!embedded) onClose?.(); }}>
            <div className={embedded ? "saas-admin-panel saas-admin-panel--embedded" : "saas-admin-panel"} onClick={(event) => event.stopPropagation()}>
                {showHeader && (
                    <div className="saas-admin-header">
                        <div>
                            <h2>Control SaaS</h2>
                            <span>Tenant activo: {String(activeTenantId || '-')}</span>
                        </div>
                        {!embedded && <button type="button" onClick={() => onClose?.()}>Cerrar</button>}
                    </div>
                )}

                {(error || notice) && (
                    <div className={`saas-admin-alert ${error ? 'error' : 'ok'}`}>
                        {error || notice}
                    </div>
                )}

                {showNavigation && (
                    <div className="saas-admin-nav">
                        {adminNavItems.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                className={`saas-admin-nav-btn ${selectedSectionId === item.id ? "active" : ""}`.trim()}
                                disabled={busy}
                                onClick={() => setCurrentSection(item.id)}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                )}

                {(!embedded || showNavigation) && (
                    <div className="saas-admin-kpis">
                        <div className="saas-admin-kpi">
                            <small>Empresas</small>
                            <strong>{overview.tenants.length}</strong>
                        </div>
                        <div className="saas-admin-kpi">
                            <small>Usuarios</small>
                            <strong>{overview.users.length}</strong>
                        </div>
                        <div className="saas-admin-kpi">
                            <small>Tenant actual</small>
                            <strong>{String(activeTenantId || '-')}</strong>
                        </div>
                    </div>
                )}

                {selectedSectionId === 'saas_resumen' && (
                    <section id="saas_resumen" className="saas-admin-card saas-admin-card--full saas-admin-flow-card">
                        <h3>Flujo operativo recomendado</h3>
                        <p>1) Superadmin crea empresa(s) y define plan/modulos.</p>
                        <p>2) Superadmin crea usuarios y asigna membresias (empresa + rol).</p>
                        <p>3) Usuario de empresa inicia sesion, elige su empresa y luego el modo WhatsApp (Dual/Webjs/Cloud segun backend).</p>
                        <p>4) La operacion diaria (chats, catalogo, IA) corre aislada por tenant activo.</p>
                    </section>
                )}

                <div className="saas-admin-grid">
                    {selectedSectionId === 'saas_empresas' && (
                    <section id="saas_empresas" className="saas-admin-card">
                        <h3>Empresas ({overview.tenants.length})</h3>
                        {canManageTenants ? (
                            <>
                                <div className="saas-admin-form-row">
                                    <input
                                        value={tenantForm.id}
                                        onChange={(event) => setTenantForm((prev) => ({ ...prev, id: event.target.value }))}
                                        placeholder="tenant_id"
                                    />
                                    <input
                                        value={tenantForm.slug}
                                        onChange={(event) => setTenantForm((prev) => ({ ...prev, slug: event.target.value }))}
                                        placeholder="slug"
                                    />
                                </div>
                                <div className="saas-admin-form-row">
                                    <input
                                        value={tenantForm.name}
                                        onChange={(event) => setTenantForm((prev) => ({ ...prev, name: event.target.value }))}
                                        placeholder="Nombre"
                                    />
                                    <select value={tenantForm.plan} onChange={(event) => setTenantForm((prev) => ({ ...prev, plan: event.target.value }))}>
                                        {PLAN_OPTIONS.map((plan) => (
                                            <option key={plan} value={plan}>{plan}</option>
                                        ))}
                                    </select>
                                </div>
                                <button
                                    type="button"
                                    disabled={busy || !tenantForm.id || !tenantForm.slug || !tenantForm.name}
                                    onClick={() => runAction('Empresa creada', async () => {
                                        await requestJson('/api/admin/saas/tenants', {
                                            method: 'POST',
                                            body: tenantForm
                                        });
                                        setTenantForm(EMPTY_TENANT_FORM);
                                    })}
                                >
                                    Crear empresa
                                </button>
                            </>
                        ) : (
                            <div className="saas-admin-alert" style={{ marginBottom: '10px' }}>
                                Solo superadmin puede crear o eliminar empresas. Vista en modo lectura.
                            </div>
                        )}

                        <div className="saas-admin-list">
                            {tenantOptions.map((tenant) => {
                                const usage = aiUsageByTenant.get(tenant.id) || 0;
                                const activeUsers = (overview.metrics || []).find((metric) => metric.tenantId === tenant.id)?.activeUsers || 0;
                                return (
                                    <div key={tenant.id} className="saas-admin-list-item">
                                        <div>
                                            <strong>{tenant.name || tenant.id}</strong>
                                            <small>{tenant.id} | plan {tenant.plan}</small>
                                            <small>Usuarios: {activeUsers} / {tenant?.limits?.maxUsers || '-'}</small>
                                            <small>IA mes: {usage} / {tenant?.limits?.maxMonthlyAiRequests || '-'}</small>
                                        </div>
                                        <div className="saas-admin-list-actions">
                                            {canManageTenants ? (
                                                <>
                                                    <button
                                                        type="button"
                                                        disabled={busy}
                                                        onClick={() => runAction('Plan actualizado', async () => {
                                                            const nextPlan = tenant.plan === 'starter' ? 'pro' : tenant.plan === 'pro' ? 'enterprise' : 'starter';
                                                            await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(tenant.id)}`, {
                                                                method: 'PUT',
                                                                body: { plan: nextPlan, active: tenant.active !== false }
                                                            });
                                                        })}
                                                    >
                                                        Cambiar plan
                                                    </button>
                                                    {tenant.id !== 'default' && (
                                                        <button
                                                            type="button"
                                                            disabled={busy}
                                                            onClick={() => runAction('Empresa eliminada', async () => {
                                                                await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(tenant.id)}`, {
                                                                    method: 'DELETE'
                                                                });
                                                                if (settingsTenantId === tenant.id) setSettingsTenantId('');
                                                            })}
                                                        >
                                                            Eliminar
                                                        </button>
                                                    )}
                                                </>
                                            ) : (
                                                <small style={{ color: '#8ea3ad' }}>Solo lectura</small>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                    )}

                    {selectedSectionId === 'saas_usuarios' && (
                    <section id="saas_usuarios" className="saas-admin-card">
                        <h3>Usuarios ({overview.users.length})</h3>
                        <div className="saas-admin-form-row">
                            <input
                                value={userForm.id}
                                onChange={(event) => setUserForm((prev) => ({ ...prev, id: event.target.value }))}
                                placeholder="user_id"
                            />
                            <input
                                value={userForm.email}
                                onChange={(event) => setUserForm((prev) => ({ ...prev, email: event.target.value }))}
                                placeholder="email"
                            />
                        </div>
                        <div className="saas-admin-form-row">
                            <input
                                value={userForm.name}
                                onChange={(event) => setUserForm((prev) => ({ ...prev, name: event.target.value }))}
                                placeholder="Nombre"
                            />
                            <input
                                value={userForm.password}
                                onChange={(event) => setUserForm((prev) => ({ ...prev, password: event.target.value }))}
                                type="password"
                                placeholder="password"
                            />
                        </div>
                        <div className="saas-admin-form-row">
                            <select value={userForm.tenantId} onChange={(event) => setUserForm((prev) => ({ ...prev, tenantId: event.target.value }))}>
                                <option value="">Tenant inicial</option>
                                {tenantOptions.map((tenant) => (
                                    <option key={tenant.id} value={tenant.id}>{tenant.name || tenant.id}</option>
                                ))}
                            </select>
                            <select value={userForm.role} onChange={(event) => setUserForm((prev) => ({ ...prev, role: event.target.value }))}>
                                {roleOptions.map((role) => (
                                    <option key={role} value={role}>{role}</option>
                                ))}
                            </select>
                        </div>
                        <button
                            type="button"
                            disabled={busy || !userForm.id || !userForm.email || !userForm.password || !userForm.tenantId}
                            onClick={() => runAction('Usuario creado', async () => {
                                await requestJson('/api/admin/saas/users', {
                                    method: 'POST',
                                    body: {
                                        id: userForm.id,
                                        email: userForm.email,
                                        name: userForm.name,
                                        password: userForm.password,
                                        memberships: [{ tenantId: userForm.tenantId, role: userForm.role, active: true }]
                                    }
                                });
                                setUserForm(EMPTY_USER_FORM);
                            })}
                        >
                            Crear usuario
                        </button>

                        <div className="saas-admin-list">
                            {(overview.users || []).map((user) => {
                                const userMemberships = sanitizeMemberships(user?.memberships || []);
                                const isEditing = editingMembershipUserId === user.id;
                                return (
                                    <div key={user.id} className="saas-admin-list-item saas-admin-list-item--stacked">
                                        <div>
                                            <strong>{user.name || user.email}</strong>
                                            <small>{user.email}</small>
                                            <small>
                                                {userMemberships.map((membership) => `${membership.tenantId}:${membership.role}${membership.active ? '' : '(off)'}`).join(' | ') || 'sin membresias'}
                                            </small>
                                        </div>

                                        <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                            <button type="button" disabled={busy} onClick={() => openMembershipEditor(user)}>
                                                {isEditing ? 'Cerrar membresias' : 'Membresias'}
                                            </button>
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => runAction('Usuario actualizado', async () => {
                                                    await requestJson(`/api/admin/saas/users/${encodeURIComponent(user.id)}`, {
                                                        method: 'PUT',
                                                        body: { active: user.active === false }
                                                    });
                                                })}
                                            >
                                                {user.active === false ? 'Activar' : 'Desactivar'}
                                            </button>
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => runAction('Usuario eliminado', async () => {
                                                    await requestJson(`/api/admin/saas/users/${encodeURIComponent(user.id)}`, {
                                                        method: 'DELETE'
                                                    });
                                                })}
                                            >
                                                Eliminar
                                            </button>
                                        </div>

                                        {isEditing && (
                                            <div className="saas-admin-membership-editor">
                                                {(membershipDraft || []).map((membership, index) => (
                                                    <div key={`${user.id}_membership_${index}`} className="saas-admin-membership-row">
                                                        <select
                                                            value={membership.tenantId}
                                                            onChange={(event) => updateMembershipDraft(index, { tenantId: event.target.value })}
                                                            disabled={busy}
                                                        >
                                                            <option value="">Tenant</option>
                                                            {tenantOptions.map((tenant) => (
                                                                <option key={tenant.id} value={tenant.id}>{tenant.name || tenant.id}</option>
                                                            ))}
                                                        </select>
                                                        <select
                                                            value={membership.role}
                                                            onChange={(event) => updateMembershipDraft(index, { role: event.target.value })}
                                                            disabled={busy}
                                                        >
                                                            {roleOptions.map((role) => (
                                                                <option key={role} value={role}>{role}</option>
                                                            ))}
                                                        </select>
                                                        <label className="saas-admin-membership-active">
                                                            <input
                                                                type="checkbox"
                                                                checked={membership.active !== false}
                                                                onChange={(event) => updateMembershipDraft(index, { active: event.target.checked })}
                                                                disabled={busy}
                                                            />
                                                            Activo
                                                        </label>
                                                        <button type="button" disabled={busy} onClick={() => removeMembershipDraft(index)}>Quitar</button>
                                                    </div>
                                                ))}

                                                <div className="saas-admin-membership-actions">
                                                    <button type="button" disabled={busy} onClick={addMembershipDraft}>Agregar fila</button>
                                                    <button
                                                        type="button"
                                                        disabled={busy || sanitizeMemberships(membershipDraft).length === 0}
                                                        onClick={() => runAction('Membresias actualizadas', async () => {
                                                            await requestJson(`/api/admin/saas/users/${encodeURIComponent(user.id)}/memberships`, {
                                                                method: 'PUT',
                                                                body: { memberships: sanitizeMemberships(membershipDraft) }
                                                            });
                                                            setEditingMembershipUserId('');
                                                            setMembershipDraft([]);
                                                        })}
                                                    >
                                                        Guardar membresias
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                    )}

                    {selectedSectionId === 'saas_config' && (
                    <section id="saas_config" className="saas-admin-card saas-admin-card--full">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                            <h3 style={{ margin: 0 }}>Configuracion por empresa</h3>
                            <button
                                type="button"
                                disabled={busy || !settingsTenantId || waModules.length === 0}
                                onClick={() => {
                                    const fallbackModuleId = String(
                                        waModules.find((item) => item?.isSelected)?.moduleId
                                        || waModules.find((item) => item?.isDefault)?.moduleId
                                        || waModules[0]?.moduleId
                                        || ''
                                    ).trim();
                                    handleOpenOperation(fallbackModuleId);
                                }}
                            >
                                Ir a operacion WhatsApp (nueva pestana)
                            </button>
                        </div>
                        <div className="saas-admin-form-row">
                            <select value={settingsTenantId} onChange={(event) => setSettingsTenantId(event.target.value)}>
                                <option value="">Seleccionar tenant</option>
                                {tenantOptions.map((tenant) => (
                                    <option key={tenant.id} value={tenant.id}>{tenant.name || tenant.id}</option>
                                ))}
                            </select>
                            <select
                                value={tenantSettings.catalogMode}
                                onChange={(event) => setTenantSettings((prev) => ({ ...prev, catalogMode: event.target.value }))}
                                disabled={!settingsTenantId || loadingSettings}
                            >
                                {CATALOG_MODE_OPTIONS.map((mode) => (
                                    <option key={mode} value={mode}>{mode}</option>
                                ))}
                            </select>
                        </div>

                        <div className="saas-admin-modules">
                            {MODULE_KEYS.map((moduleEntry) => (
                                <label key={moduleEntry.key} className="saas-admin-module-toggle">
                                    <input
                                        type="checkbox"
                                        checked={tenantSettings?.enabledModules?.[moduleEntry.key] !== false}
                                        disabled={!settingsTenantId || loadingSettings}
                                        onChange={(event) => setTenantSettings((prev) => ({
                                            ...prev,
                                            enabledModules: {
                                                ...(prev?.enabledModules || {}),
                                                [moduleEntry.key]: event.target.checked
                                            }
                                        }))}
                                    />
                                    <span>{moduleEntry.label}</span>
                                </label>
                            ))}
                        </div>

                        <div style={{ marginTop: '12px', border: '1px solid rgba(134,150,160,0.22)', borderRadius: '10px', padding: '12px' }}>
                            <h4 style={{ margin: '0 0 6px', color: '#d7e5ee', fontSize: '0.92rem' }}>Modulos WhatsApp de la empresa</h4>
                            <p style={{ margin: '0 0 10px', color: '#8fa6b6', fontSize: '0.76rem' }}>
                                Cada modulo representa un numero/canal de WhatsApp (Web.js o Cloud API) para esta empresa. El ID interno se genera automaticamente.
                            </p>

                            <div className="saas-admin-form-row">
                                <input
                                    value={waModuleForm.moduleId}
                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, moduleId: event.target.value.toLowerCase() }))}
                                    type="hidden"
                                    disabled={!settingsTenantId || busy || Boolean(editingWaModuleId)}
                                />
                                <input
                                    value={waModuleForm.name}
                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, name: event.target.value }))}
                                    placeholder="Nombre del modulo"
                                    disabled={!settingsTenantId || busy}
                                />
                            </div>

                            <div className="saas-admin-form-row">
                                <input
                                    value={waModuleForm.phoneNumber}
                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, phoneNumber: event.target.value }))}
                                    placeholder="Numero (ej: +51999999999)"
                                    disabled={!settingsTenantId || busy}
                                />
                                <select
                                    value={waModuleForm.transportMode}
                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, transportMode: event.target.value }))}
                                    disabled={!settingsTenantId || busy}
                                >
                                    <option value="webjs">Web.js</option>
                                    <option value="cloud">Cloud API</option>
                                </select>
                            </div>

                            <div className="saas-admin-form-row">
                                <input
                                    value={waModuleForm.assignedUserIds}
                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, assignedUserIds: event.target.value }))}
                                    placeholder="Usuarios permitidos (csv user_id, opcional)"
                                    disabled={!settingsTenantId || busy}
                                />
                            </div>

                            <div className="saas-admin-form-row saas-admin-form-row--actions">
                                <button
                                    type="button"
                                    disabled={busy || !settingsTenantId || !waModuleForm.name}
                                    onClick={() => runAction(editingWaModuleId ? 'Modulo WA actualizado' : 'Modulo WA creado', async () => {
                                        const payload = {
                                            moduleId: waModuleForm.moduleId,
                                            name: waModuleForm.name,
                                            phoneNumber: waModuleForm.phoneNumber,
                                            transportMode: waModuleForm.transportMode,
                                            assignedUserIds: parseAssignedUserIds(waModuleForm.assignedUserIds)
                                        };
                                        if (editingWaModuleId) {
                                            await requestJson('/api/admin/saas/tenants/' + encodeURIComponent(settingsTenantId) + '/wa-modules/' + encodeURIComponent(editingWaModuleId), {
                                                method: 'PUT',
                                                body: payload
                                            });
                                        } else {
                                            const createPayload = await requestJson('/api/admin/saas/tenants/' + encodeURIComponent(settingsTenantId) + '/wa-modules', {
                                                method: 'POST',
                                                body: payload
                                            });
                                            const createdModuleId = String(createPayload?.item?.moduleId || '').trim();
                                            if (createdModuleId) {
                                                handleOpenOperation(createdModuleId);
                                            }
                                        }
                                        resetWaModuleForm();
                                    })}
                                >
                                    {editingWaModuleId ? 'Guardar modulo' : 'Crear modulo'}
                                </button>
                                {editingWaModuleId && (
                                    <button type="button" disabled={busy} onClick={resetWaModuleForm}>
                                        Cancelar edicion
                                    </button>
                                )}
                            </div>

                            <div className="saas-admin-list">
                                {waModules.length === 0 && (
                                    <div className="saas-admin-list-item">
                                        <small>No hay modulos WhatsApp registrados para este tenant.</small>
                                    </div>
                                )}
                                {waModules.map((moduleItem) => (
                                    <div key={moduleItem.moduleId} className="saas-admin-list-item saas-admin-list-item--stacked">
                                        <div>
                                            <strong>{moduleItem.name}</strong>
                                            <small>Numero: {moduleItem.phoneNumber || 'sin numero'}</small>
                                            <small>Transporte: {moduleItem.transportMode === 'cloud' ? 'Cloud API' : 'Web.js'} | {moduleItem.isActive ? 'activo' : 'inactivo'}{moduleItem.isSelected ? ' | seleccionado' : ''}</small>
                                            {moduleItem.assignedUserIds.length > 0 && (
                                                <small>Usuarios: {moduleItem.assignedUserIds.join(', ')}</small>
                                            )}
                                        </div>
                                        <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                            <button
                                                type="button"
                                                disabled={busy || !settingsTenantId || !moduleItem.isActive}
                                                onClick={() => handleOpenOperation(moduleItem.moduleId)}
                                            >
                                                Ir a WhatsApp (nueva pestana)
                                            </button>
                                            <button
                                                type="button"
                                                disabled={busy || !settingsTenantId || moduleItem.isSelected}
                                                onClick={() => runAction('Modulo WA seleccionado', async () => {
                                                    await requestJson('/api/admin/saas/tenants/' + encodeURIComponent(settingsTenantId) + '/wa-modules/' + encodeURIComponent(moduleItem.moduleId) + '/select', {
                                                        method: 'POST'
                                                    });
                                                })}
                                            >
                                                {moduleItem.isSelected ? 'En uso' : 'Seleccionar'}
                                            </button>
                                            <button type="button" disabled={busy} onClick={() => openWaModuleEditor(moduleItem)}>
                                                Editar
                                            </button>
                                            <button
                                                type="button"
                                                disabled={busy || !settingsTenantId}
                                                onClick={() => runAction('Estado de modulo actualizado', async () => {
                                                    await requestJson('/api/admin/saas/tenants/' + encodeURIComponent(settingsTenantId) + '/wa-modules/' + encodeURIComponent(moduleItem.moduleId), {
                                                        method: 'PUT',
                                                        body: { isActive: moduleItem.isActive === false }
                                                    });
                                                })}
                                            >
                                                {moduleItem.isActive ? 'Desactivar' : 'Activar'}
                                            </button>
                                            <button
                                                type="button"
                                                disabled={busy || !settingsTenantId}
                                                onClick={() => runAction('Modulo WA eliminado', async () => {
                                                    await requestJson('/api/admin/saas/tenants/' + encodeURIComponent(settingsTenantId) + '/wa-modules/' + encodeURIComponent(moduleItem.moduleId), {
                                                        method: 'DELETE'
                                                    });
                                                    if (editingWaModuleId === moduleItem.moduleId) resetWaModuleForm();
                                                })}
                                            >
                                                Eliminar
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="saas-admin-form-row saas-admin-form-row--actions">
                            <button
                                type="button"
                                disabled={busy || !settingsTenantId || loadingSettings}
                                onClick={() => runAction('Configuracion de tenant guardada', async () => {
                                    await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(settingsTenantId)}/settings`, {
                                        method: 'PUT',
                                        body: {
                                            catalogMode: tenantSettings.catalogMode,
                                            enabledModules: tenantSettings.enabledModules
                                        }
                                    });
                                })}
                            >
                                Guardar configuracion
                            </button>
                            <button
                                type="button"
                                disabled={busy || loadingSettings}
                                onClick={() => runAction('Panel recargado', refreshOverview)}
                            >
                                Recargar panel
                            </button>
                        </div>
                    </section>
                    )}
                </div>
            </div>
        </div>
    );
}










