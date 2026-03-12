import { useEffect, useMemo, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const EMPTY_TENANT_FORM = {
    id: '',
    slug: '',
    name: '',
    plan: 'starter',
    active: true,
    logoUrl: '',
    coverImageUrl: '',
    metadataText: '{}'
};

const EMPTY_USER_FORM = {
    id: '',
    email: '',
    name: '',
    password: '',
    tenantId: '',
    role: 'seller',
    active: true,
    avatarUrl: '',
    metadataText: '{}'
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
    imageUrl: '',
    assignedUserIds: '',
    cloudAppId: '',
    cloudWabaId: '',
    cloudPhoneNumberId: '',
    cloudVerifyToken: '',
    cloudGraphVersion: 'v22.0',
    cloudDisplayPhoneNumber: '',
    cloudBusinessName: '',
    cloudAppSecret: '',
    cloudSystemUserToken: '',
    cloudAppSecretMasked: '',
    cloudSystemUserTokenMasked: ''
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

function safeJsonParse(raw = '{}', fallback = {}) {
    try {
        const parsed = JSON.parse(String(raw || '{}'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
        return parsed;
    } catch (_) {
        throw new Error('JSON invalido. Revisa el formato.');
    }
}

function prettyJson(value = {}) {
    try {
        return JSON.stringify(value && typeof value === 'object' ? value : {}, null, 2);
    } catch (_) {
        return '{}';
    }
}

function normalizeWaModule(item = {}) {
    const source = item && typeof item === 'object' ? item : {};
    const moduleId = String(source.moduleId || source.id || '').trim().toLowerCase();
    if (!moduleId) return null;

    const metadata = source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)
        ? source.metadata
        : {};
    const cloudConfig = metadata.cloudConfig && typeof metadata.cloudConfig === 'object' && !Array.isArray(metadata.cloudConfig)
        ? metadata.cloudConfig
        : {};

    return {
        moduleId,
        name: String(source.name || moduleId).trim() || moduleId,
        phoneNumber: String(source.phoneNumber || '').trim() || '',
        transportMode: String(source.transportMode || source.mode || 'webjs').trim().toLowerCase() === 'cloud' ? 'cloud' : 'webjs',
        imageUrl: String(source.imageUrl || '').trim() || '',
        isActive: source.isActive !== false,
        isDefault: source.isDefault === true,
        isSelected: source.isSelected === true,
        assignedUserIds: Array.isArray(source.assignedUserIds)
            ? source.assignedUserIds.map((entry) => String(entry || '').trim()).filter(Boolean)
            : [],
        metadata,
        cloudConfig: {
            appId: String(cloudConfig.appId || '').trim(),
            wabaId: String(cloudConfig.wabaId || '').trim(),
            phoneNumberId: String(cloudConfig.phoneNumberId || '').trim(),
            verifyToken: String(cloudConfig.verifyToken || '').trim(),
            graphVersion: String(cloudConfig.graphVersion || '').trim(),
            displayPhoneNumber: String(cloudConfig.displayPhoneNumber || '').trim(),
            businessName: String(cloudConfig.businessName || '').trim(),
            appSecretMasked: String(cloudConfig.appSecretMasked || '').trim(),
            systemUserTokenMasked: String(cloudConfig.systemUserTokenMasked || '').trim()
        }
    };
}

function buildTenantFormFromItem(item = null) {
    if (!item || typeof item !== 'object') return EMPTY_TENANT_FORM;
    return {
        id: String(item.id || '').trim(),
        slug: String(item.slug || '').trim(),
        name: String(item.name || '').trim(),
        plan: PLAN_OPTIONS.includes(String(item.plan || '').trim().toLowerCase())
            ? String(item.plan || '').trim().toLowerCase()
            : 'starter',
        active: item.active !== false,
        logoUrl: String(item.logoUrl || '').trim(),
        coverImageUrl: String(item.coverImageUrl || '').trim(),
        metadataText: prettyJson(item.metadata || {})
    };
}

function buildUserFormFromItem(item = null) {
    if (!item || typeof item !== 'object') return EMPTY_USER_FORM;
    const memberships = sanitizeMemberships(item.memberships || []);
    const primaryMembership = memberships[0] || { tenantId: '', role: 'seller' };
    const primaryRole = ROLE_OPTIONS.includes(String(primaryMembership.role || '').trim().toLowerCase())
        ? String(primaryMembership.role || '').trim().toLowerCase()
        : 'seller';

    return {
        id: String(item.id || '').trim(),
        email: String(item.email || '').trim(),
        name: String(item.name || '').trim(),
        password: '',
        tenantId: String(primaryMembership.tenantId || '').trim(),
        role: primaryRole,
        active: item.active !== false,
        avatarUrl: String(item.avatarUrl || '').trim(),
        metadataText: prettyJson(item.metadata || {})
    };
}

function formatDateTimeLabel(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return '-';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleString('es-PE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
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
    const [selectedTenantId, setSelectedTenantId] = useState('');
    const [selectedUserId, setSelectedUserId] = useState('');
    const [selectedWaModuleId, setSelectedWaModuleId] = useState('');

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
    const selectedTenant = useMemo(
        () => tenantOptions.find((tenant) => String(tenant?.id || '') === String(selectedTenantId || '')) || null,
        [tenantOptions, selectedTenantId]
    );

    const selectedUser = useMemo(
        () => (overview.users || []).find((user) => String(user?.id || '') === String(selectedUserId || '')) || null,
        [overview.users, selectedUserId]
    );

    const selectedWaModule = useMemo(
        () => (waModules || []).find((item) => String(item?.moduleId || '') === String(selectedWaModuleId || '')) || null,
        [waModules, selectedWaModuleId]
    );

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

        const availableTenantIds = new Set((next.tenants || []).map((item) => String(item?.id || '').trim()).filter(Boolean));
        const fallbackTenantId = String(activeTenantId || next.tenants?.[0]?.id || '').trim();

        setSelectedTenantId((prev) => {
            const cleanPrev = String(prev || '').trim();
            if (cleanPrev && availableTenantIds.has(cleanPrev)) return cleanPrev;
            return fallbackTenantId;
        });

        setSettingsTenantId((prev) => {
            const cleanPrev = String(prev || '').trim();
            if (cleanPrev && availableTenantIds.has(cleanPrev)) return cleanPrev;
            return fallbackTenantId;
        });

        const availableUserIds = new Set((next.users || []).map((item) => String(item?.id || '').trim()).filter(Boolean));
        const fallbackUserId = String(next.users?.[0]?.id || '').trim();
        setSelectedUserId((prev) => {
            const cleanPrev = String(prev || '').trim();
            if (cleanPrev && availableUserIds.has(cleanPrev)) return cleanPrev;
            return fallbackUserId;
        });
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
            setSelectedWaModuleId('');
            return;
        }
        const payload = await requestJson('/api/admin/saas/tenants/' + encodeURIComponent(cleanTenantId) + '/wa-modules');
        const items = (Array.isArray(payload?.items) ? payload.items : [])
            .map(normalizeWaModule)
            .filter(Boolean)
            .sort((a, b) => String(a.name || a.moduleId).localeCompare(String(b.name || b.moduleId), 'es', { sensitivity: 'base' }));
        const selectedFromApi = String(payload?.selected?.moduleId || '').trim().toLowerCase();
        const fallbackSelected = selectedFromApi || String(items[0]?.moduleId || '').trim().toLowerCase();
        setWaModules(items);
        setSelectedWaModuleId((prev) => {
            const cleanPrev = String(prev || '').trim().toLowerCase();
            const prevExists = items.some((item) => String(item?.moduleId || '').trim().toLowerCase() === cleanPrev);
            if (prevExists) return cleanPrev;
            return fallbackSelected;
        });
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
        setSelectedWaModuleId(item.moduleId);
        setEditingWaModuleId(item.moduleId);
        setWaModuleForm({
            moduleId: item.moduleId,
            name: item.name,
            phoneNumber: item.phoneNumber || '',
            transportMode: item.transportMode || 'webjs',
            imageUrl: item.imageUrl || '',
            assignedUserIds: (item.assignedUserIds || []).join(', '),
            cloudAppId: item?.cloudConfig?.appId || '',
            cloudWabaId: item?.cloudConfig?.wabaId || '',
            cloudPhoneNumberId: item?.cloudConfig?.phoneNumberId || '',
            cloudVerifyToken: item?.cloudConfig?.verifyToken || '',
            cloudGraphVersion: item?.cloudConfig?.graphVersion || 'v22.0',
            cloudDisplayPhoneNumber: item?.cloudConfig?.displayPhoneNumber || '',
            cloudBusinessName: item?.cloudConfig?.businessName || '',
            cloudAppSecret: '',
            cloudSystemUserToken: '',
            cloudAppSecretMasked: item?.cloudConfig?.appSecretMasked || '',
            cloudSystemUserTokenMasked: item?.cloudConfig?.systemUserTokenMasked || ''
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

    useEffect(() => {
        if (!selectedTenant) {
            setTenantForm(EMPTY_TENANT_FORM);
            return;
        }
        setTenantForm(buildTenantFormFromItem(selectedTenant));
    }, [selectedTenant]);

    useEffect(() => {
        if (!selectedUser) {
            setUserForm(EMPTY_USER_FORM);
            return;
        }
        setUserForm(buildUserFormFromItem(selectedUser));
    }, [selectedUser]);

    useEffect(() => {
        if (!selectedWaModule) {
            resetWaModuleForm();
            return;
        }
        openWaModuleEditor(selectedWaModule);
    }, [selectedWaModule]);

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
                        <small style={{ color: '#8ea7b8' }}>Selecciona una fila para editar detalle en este panel derecho. Los codigos se generan automaticamente si dejas el ID vacio.</small>
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
                                <div className="saas-admin-form-row">
                                    <input
                                        value={tenantForm.logoUrl}
                                        onChange={(event) => setTenantForm((prev) => ({ ...prev, logoUrl: event.target.value }))}
                                        placeholder="Logo URL"
                                    />
                                    <input
                                        value={tenantForm.coverImageUrl}
                                        onChange={(event) => setTenantForm((prev) => ({ ...prev, coverImageUrl: event.target.value }))}
                                        placeholder="Cover URL"
                                    />
                                </div>
                                                                {(tenantForm.logoUrl || tenantForm.coverImageUrl) && (
                                    <div className="saas-admin-preview-strip">
                                        {tenantForm.logoUrl && <img src={tenantForm.logoUrl} alt="Logo empresa" className="saas-admin-preview-thumb" />}
                                        {tenantForm.coverImageUrl && <img src={tenantForm.coverImageUrl} alt="Portada empresa" className="saas-admin-preview-thumb saas-admin-preview-thumb--wide" />}
                                    </div>
                                )}
                                <div className="saas-admin-form-row">
                                    <label className="saas-admin-module-toggle">
                                        <input
                                            type="checkbox"
                                            checked={tenantForm.active !== false}
                                            onChange={(event) => setTenantForm((prev) => ({ ...prev, active: event.target.checked }))}
                                        />
                                        <span>Empresa activa</span>
                                    </label>
                                </div>
                                <div className="saas-admin-form-row">
                                    <textarea
                                        value={tenantForm.metadataText}
                                        onChange={(event) => setTenantForm((prev) => ({ ...prev, metadataText: event.target.value }))}
                                        placeholder="Metadata JSON"
                                        rows={4}
                                        style={{ width: '100%' }}
                                    />
                                </div>
                                <div className="saas-admin-form-row saas-admin-form-row--actions">
                                    <button
                                        type="button"
                                        disabled={busy || !tenantForm.name}
                                        onClick={() => runAction(selectedTenant ? 'Empresa actualizada' : 'Empresa creada', async () => {
                                            const payload = {
                                                id: tenantForm.id || undefined,
                                                slug: tenantForm.slug || undefined,
                                                name: tenantForm.name,
                                                plan: tenantForm.plan,
                                                active: tenantForm.active !== false,
                                                logoUrl: tenantForm.logoUrl || null,
                                                coverImageUrl: tenantForm.coverImageUrl || null,
                                                metadata: safeJsonParse(tenantForm.metadataText || '{}', {})
                                            };

                                            if (selectedTenant?.id) {
                                                await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(selectedTenant.id)}`, {
                                                    method: 'PUT',
                                                    body: payload
                                                });
                                                return;
                                            }

                                            const createdPayload = await requestJson('/api/admin/saas/tenants', {
                                                method: 'POST',
                                                body: payload
                                            });
                                            const createdId = String(createdPayload?.tenant?.id || '').trim();
                                            if (createdId) {
                                                setSelectedTenantId(createdId);
                                                setSettingsTenantId(createdId);
                                            }
                                        })}
                                    >
                                        {selectedTenant?.id ? 'Guardar empresa' : 'Crear empresa'}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => {
                                            setSelectedTenantId('');
                                            setTenantForm(EMPTY_TENANT_FORM);
                                        }}
                                    >
                                        Nueva empresa
                                    </button>
                                </div>
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
                                    <div key={tenant.id} className={`saas-admin-list-item ${selectedTenantId === tenant.id ? 'active' : ''}`.trim()} onClick={() => { setSelectedTenantId(tenant.id); setSettingsTenantId(tenant.id); }}>
                                        <div>
                                            {tenant.logoUrl && <img src={tenant.logoUrl} alt={tenant.name || tenant.id} className="saas-admin-inline-avatar" />}
                                            <strong>{tenant.name || tenant.id}</strong>
                                            <small>{tenant.id} | plan {tenant.plan}</small>
                                            <small>Usuarios: {activeUsers} / {tenant?.limits?.maxUsers || '-'}</small>
                                            <small>IA mes: {usage} / {tenant?.limits?.maxMonthlyAiRequests || '-'}</small>
                                            <small>Actualizado: {formatDateTimeLabel(tenant.updatedAt)}</small>
                                        </div>
                                        <div className="saas-admin-list-actions" onClick={(event) => event.stopPropagation()}>
                                            {canManageTenants ? (
                                                <>
                                                    <button
                                                        type="button"
                                                        disabled={busy}
                                                        onClick={() => runAction('Plan actualizado', async () => {
                                                            const nextPlan = tenant.plan === 'starter' ? 'pro' : tenant.plan === 'pro' ? 'enterprise' : 'starter';
                                                            await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(tenant.id)}`, {
                                                                method: 'PUT',
                                                                body: {
                                                                    plan: nextPlan,
                                                                    active: tenant.active !== false,
                                                                    logoUrl: tenant.logoUrl || null,
                                                                    coverImageUrl: tenant.coverImageUrl || null,
                                                                    metadata: tenant.metadata || {}
                                                                }
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
                                                                if (selectedTenantId === tenant.id) setSelectedTenantId('');
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
                        <small style={{ color: '#8ea7b8' }}>Selecciona un usuario para editar perfil, avatar y membresias sin perder el menu izquierdo.</small>
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
                        <div className="saas-admin-form-row">
                            <input
                                value={userForm.avatarUrl}
                                onChange={(event) => setUserForm((prev) => ({ ...prev, avatarUrl: event.target.value }))}
                                placeholder="Avatar URL"
                            />
                            <label className="saas-admin-module-toggle">
                                <input
                                    type="checkbox"
                                    checked={userForm.active !== false}
                                    onChange={(event) => setUserForm((prev) => ({ ...prev, active: event.target.checked }))}
                                />
                                <span>Usuario activo</span>
                            </label>
                        </div>
                        {userForm.avatarUrl && (
                            <div className="saas-admin-preview-strip">
                                <img src={userForm.avatarUrl} alt="Avatar usuario" className="saas-admin-preview-thumb" />
                            </div>
                        )}
                        <div className="saas-admin-form-row">
                            <textarea
                                value={userForm.metadataText}
                                onChange={(event) => setUserForm((prev) => ({ ...prev, metadataText: event.target.value }))}
                                placeholder="Metadata JSON"
                                rows={4}
                                style={{ width: '100%' }}
                            />
                        </div>
                                <div className="saas-admin-form-row saas-admin-form-row--actions">
                            <button
                                type="button"
                                disabled={busy || !userForm.email || !userForm.tenantId || (!selectedUser?.id && !userForm.password)}
                                onClick={() => runAction(selectedUser?.id ? 'Usuario actualizado' : 'Usuario creado', async () => {
                                    const payload = {
                                        id: userForm.id || undefined,
                                        email: userForm.email,
                                        name: userForm.name,
                                        active: userForm.active !== false,
                                        avatarUrl: userForm.avatarUrl || null,
                                        metadata: safeJsonParse(userForm.metadataText || '{}', {}),
                                        memberships: [{ tenantId: userForm.tenantId, role: userForm.role, active: true }]
                                    };
                                    if (userForm.password) {
                                        payload.password = userForm.password;
                                    }

                                    if (selectedUser?.id) {
                                        await requestJson(`/api/admin/saas/users/${encodeURIComponent(selectedUser.id)}`, {
                                            method: 'PUT',
                                            body: payload
                                        });
                                        return;
                                    }

                                    const createdPayload = await requestJson('/api/admin/saas/users', {
                                        method: 'POST',
                                        body: payload
                                    });
                                    const createdId = String(createdPayload?.user?.id || '').trim();
                                    if (createdId) setSelectedUserId(createdId);
                                })}
                            >
                                {selectedUser?.id ? 'Guardar usuario' : 'Crear usuario'}
                            </button>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                    setSelectedUserId('');
                                    setUserForm(EMPTY_USER_FORM);
                                    setEditingMembershipUserId('');
                                    setMembershipDraft([]);
                                }}
                            >
                                Nuevo usuario
                            </button>
                        </div>

                        <div className="saas-admin-list">
                            {(overview.users || []).map((user) => {
                                const userMemberships = sanitizeMemberships(user?.memberships || []);
                                const isEditing = editingMembershipUserId === user.id;
                                return (
                                    <div key={user.id} className={`saas-admin-list-item saas-admin-list-item--stacked ${selectedUserId === user.id ? 'active' : ''}`.trim()} onClick={() => setSelectedUserId(user.id)}>
                                        <div>
                                            {user.avatarUrl && <img src={user.avatarUrl} alt={user.name || user.email} className="saas-admin-inline-avatar" />}
                                            <strong>{user.name || user.email}</strong>
                                            <small>{user.email}</small>
                                            <small>Actualizado: {formatDateTimeLabel(user.updatedAt)}</small>
                                            <small>
                                                {userMemberships.map((membership) => `${membership.tenantId}:${membership.role}${membership.active ? '' : '(off)'}`).join(' | ') || 'sin membresias'}
                                            </small>
                                        </div>

                                        <div className="saas-admin-list-actions saas-admin-list-actions--row" onClick={(event) => event.stopPropagation()}>
                                            <button type="button" disabled={busy} onClick={() => openMembershipEditor(user)}>
                                                {isEditing ? 'Cerrar membresias' : 'Membresias'}
                                            </button>
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => runAction('Usuario actualizado', async () => {
                                                    await requestJson(`/api/admin/saas/users/${encodeURIComponent(user.id)}`, {
                                                        method: 'PUT',
                                                        body: {
                                                            active: user.active === false,
                                                            avatarUrl: user.avatarUrl || null,
                                                            metadata: user.metadata || {}
                                                        }
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
                            <small style={{ color: '#8ea7b8' }}>Selecciona un modulo para abrir su detalle completo (credenciales Meta, asignaciones e imagen).</small>
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
                                    value={waModuleForm.imageUrl}
                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, imageUrl: event.target.value }))}
                                    placeholder="Imagen URL del modulo"
                                    disabled={!settingsTenantId || busy}
                                />
                            </div>
                            {waModuleForm.imageUrl && (
                                <div className="saas-admin-preview-strip">
                                    <img src={waModuleForm.imageUrl} alt="Imagen modulo" className="saas-admin-preview-thumb" />
                                </div>
                            )}
                            <div className="saas-admin-form-row">
                                <input
                                    value={waModuleForm.assignedUserIds}
                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, assignedUserIds: event.target.value }))}
                                    placeholder="Usuarios permitidos (csv user_id, opcional)"
                                    disabled={!settingsTenantId || busy}
                                />
                            </div>
                            <div className="saas-admin-form-row">
                                <input
                                    value={waModuleForm.cloudAppId}
                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, cloudAppId: event.target.value }))}
                                    placeholder="Meta App ID"
                                    disabled={!settingsTenantId || busy}
                                />
                                <input
                                    value={waModuleForm.cloudWabaId}
                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, cloudWabaId: event.target.value }))}
                                    placeholder="Meta WABA ID"
                                    disabled={!settingsTenantId || busy}
                                />
                            </div>
                            <div className="saas-admin-form-row">
                                <input
                                    value={waModuleForm.cloudPhoneNumberId}
                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, cloudPhoneNumberId: event.target.value }))}
                                    placeholder="Meta Phone Number ID"
                                    disabled={!settingsTenantId || busy}
                                />
                                <input
                                    value={waModuleForm.cloudVerifyToken}
                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, cloudVerifyToken: event.target.value }))}
                                    placeholder="Meta Verify Token"
                                    disabled={!settingsTenantId || busy}
                                />
                            </div>
                            <div className="saas-admin-form-row">
                                <input
                                    value={waModuleForm.cloudGraphVersion}
                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, cloudGraphVersion: event.target.value }))}
                                    placeholder="Graph version (v22.0)"
                                    disabled={!settingsTenantId || busy}
                                />
                                <input
                                    value={waModuleForm.cloudDisplayPhoneNumber}
                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, cloudDisplayPhoneNumber: event.target.value }))}
                                    placeholder="Display phone"
                                    disabled={!settingsTenantId || busy}
                                />
                            </div>
                            <div className="saas-admin-form-row">
                                <input
                                    value={waModuleForm.cloudBusinessName}
                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, cloudBusinessName: event.target.value }))}
                                    placeholder="Business name"
                                    disabled={!settingsTenantId || busy}
                                />
                            </div>
                            <div className="saas-admin-form-row">
                                <input
                                    type="password"
                                    value={waModuleForm.cloudAppSecret}
                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, cloudAppSecret: event.target.value }))}
                                    placeholder={waModuleForm.cloudAppSecretMasked || 'App Secret (opcional para actualizar)'}
                                    disabled={!settingsTenantId || busy}
                                />
                                <input
                                    type="password"
                                    value={waModuleForm.cloudSystemUserToken}
                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, cloudSystemUserToken: event.target.value }))}
                                    placeholder={waModuleForm.cloudSystemUserTokenMasked || 'System User Token (opcional para actualizar)'}
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
                                            imageUrl: waModuleForm.imageUrl || null,
                                            assignedUserIds: parseAssignedUserIds(waModuleForm.assignedUserIds),
                                            metadata: {
                                                cloudConfig: {
                                                    appId: waModuleForm.cloudAppId || undefined,
                                                    wabaId: waModuleForm.cloudWabaId || undefined,
                                                    phoneNumberId: waModuleForm.cloudPhoneNumberId || undefined,
                                                    verifyToken: waModuleForm.cloudVerifyToken || undefined,
                                                    graphVersion: waModuleForm.cloudGraphVersion || undefined,
                                                    displayPhoneNumber: waModuleForm.cloudDisplayPhoneNumber || undefined,
                                                    businessName: waModuleForm.cloudBusinessName || undefined,
                                                    appSecret: waModuleForm.cloudAppSecret || undefined,
                                                    systemUserToken: waModuleForm.cloudSystemUserToken || undefined
                                                }
                                            }
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
                                                setSelectedWaModuleId(createdModuleId);
                                                handleOpenOperation(createdModuleId);
                                            }
                                        }
                                        resetWaModuleForm();
                                    })}
                                >
                                    {editingWaModuleId ? 'Guardar modulo' : 'Crear modulo'}
                                </button>
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => {
                                        setSelectedWaModuleId('');
                                        resetWaModuleForm();
                                    }}
                                >
                                    Nuevo modulo
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
                                    <div key={moduleItem.moduleId} className={`saas-admin-list-item saas-admin-list-item--stacked ${selectedWaModuleId === moduleItem.moduleId ? 'active' : ''}`.trim()} onClick={() => setSelectedWaModuleId(moduleItem.moduleId)}>
                                        <div>
                                            {moduleItem.imageUrl && <img src={moduleItem.imageUrl} alt={moduleItem.name} className="saas-admin-inline-avatar" />}
                                            <strong>{moduleItem.name}</strong>
                                            <small>Numero: {moduleItem.phoneNumber || 'sin numero'}</small>
                                            <small>Transporte: {moduleItem.transportMode === 'cloud' ? 'Cloud API' : 'Web.js'} | {moduleItem.isActive ? 'activo' : 'inactivo'}{moduleItem.isSelected ? ' | seleccionado' : ''}</small>
                                            <small>Actualizado: {formatDateTimeLabel(moduleItem.updatedAt)}</small>
                                            {moduleItem.assignedUserIds.length > 0 && (
                                                <small>Usuarios: {moduleItem.assignedUserIds.join(', ')}</small>
                                            )}
                                        </div>
                                        <div className="saas-admin-list-actions saas-admin-list-actions--row" onClick={(event) => event.stopPropagation()}>
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
                                                        body: {
                                                            isActive: moduleItem.isActive === false,
                                                            imageUrl: moduleItem.imageUrl || null,
                                                            metadata: moduleItem.metadata || {}
                                                        }
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
                                                    if (selectedWaModuleId === moduleItem.moduleId) setSelectedWaModuleId('');
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

