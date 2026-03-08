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

const ROLE_OPTIONS = ['owner', 'admin', 'seller'];
const PLAN_OPTIONS = ['starter', 'pro', 'enterprise'];
const CATALOG_MODE_OPTIONS = ['hybrid', 'woo_only', 'local_only'];
const MODULE_KEYS = [
    { key: 'aiPro', label: 'IA Pro' },
    { key: 'catalog', label: 'Catalogo' },
    { key: 'cart', label: 'Carrito' },
    { key: 'quickReplies', label: 'Respuestas rapidas' }
];

function normalizeOverview(payload = {}) {
    return {
        tenants: Array.isArray(payload?.tenants) ? payload.tenants : [],
        users: Array.isArray(payload?.users) ? payload.users : [],
        metrics: Array.isArray(payload?.metrics) ? payload.metrics : [],
        aiUsage: Array.isArray(payload?.aiUsage) ? payload.aiUsage : []
    };
}

export default function SaasAdminPanel({
    isOpen = false,
    onClose,
    buildApiHeaders,
    activeTenantId = '',
    canManageSaas = false,
}) {
    const [overview, setOverview] = useState({ tenants: [], users: [], metrics: [], aiUsage: [] });
    const [tenantForm, setTenantForm] = useState(EMPTY_TENANT_FORM);
    const [userForm, setUserForm] = useState(EMPTY_USER_FORM);
    const [settingsTenantId, setSettingsTenantId] = useState('');
    const [tenantSettings, setTenantSettings] = useState(EMPTY_SETTINGS);

    const [busy, setBusy] = useState(false);
    const [loadingSettings, setLoadingSettings] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

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

    const runAction = async (label, action) => {
        setError('');
        setNotice('');
        setBusy(true);
        try {
            await action();
            await refreshOverview();
            if (settingsTenantId) {
                await loadTenantSettings(settingsTenantId);
            }
            setNotice(`${label} completado.`);
        } catch (err) {
            setError(String(err?.message || err || 'Error inesperado.'));
        } finally {
            setBusy(false);
        }
    };

    useEffect(() => {
        if (!isOpen || !canManageSaas) return;
        runAction('Carga inicial', async () => {
            await refreshOverview();
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, canManageSaas]);

    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (event) => {
            if (event.key === 'Escape') onClose?.();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isOpen, onClose]);

    useEffect(() => {
        if (!isOpen || !canManageSaas || !settingsTenantId) return;
        loadTenantSettings(settingsTenantId).catch((err) => {
            setError(String(err?.message || err || 'No se pudo cargar configuracion del tenant.'));
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, canManageSaas, settingsTenantId]);

    if (!isOpen) return null;

    if (!canManageSaas) {
        return (
            <div className="saas-admin-overlay" onClick={() => onClose?.()}>
                <div className="saas-admin-panel" onClick={(event) => event.stopPropagation()}>
                    <div className="saas-admin-header">
                        <h2>Panel SaaS</h2>
                        <button type="button" onClick={() => onClose?.()}>Cerrar</button>
                    </div>
                    <p>No tienes permisos para administrar empresas y usuarios.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="saas-admin-overlay" onClick={() => onClose?.()}>
            <div className="saas-admin-panel" onClick={(event) => event.stopPropagation()}>
                <div className="saas-admin-header">
                    <div>
                        <h2>Control SaaS</h2>
                        <span>Tenant activo: {String(activeTenantId || '-')}</span>
                    </div>
                    <button type="button" onClick={() => onClose?.()}>Cerrar</button>
                </div>

                {(error || notice) && (
                    <div className={`saas-admin-alert ${error ? 'error' : 'ok'}`}>
                        {error || notice}
                    </div>
                )}

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

                <div className="saas-admin-grid">
                    <section className="saas-admin-card">
                        <h3>Empresas ({overview.tenants.length})</h3>
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

                        <div className="saas-admin-list">
                            {tenantOptions.map((tenant) => {
                                const usage = aiUsageByTenant.get(tenant.id) || 0;
                                const activeUsers = (overview.metrics || []).find((metric) => metric.tenantId === tenant.id)?.activeUsers || 0;
                                return (
                                    <div key={tenant.id} className="saas-admin-list-item">
                                        <div>
                                            <strong>{tenant.name || tenant.id}</strong>
                                            <small>{tenant.id} · plan {tenant.plan}</small>
                                            <small>Usuarios: {activeUsers} / {tenant?.limits?.maxUsers || '-'}</small>
                                            <small>IA mes: {usage} / {tenant?.limits?.maxMonthlyAiRequests || '-'}</small>
                                        </div>
                                        <div className="saas-admin-list-actions">
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
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    <section className="saas-admin-card">
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
                                <option value="">Tenant</option>
                                {tenantOptions.map((tenant) => (
                                    <option key={tenant.id} value={tenant.id}>{tenant.name || tenant.id}</option>
                                ))}
                            </select>
                            <select value={userForm.role} onChange={(event) => setUserForm((prev) => ({ ...prev, role: event.target.value }))}>
                                {ROLE_OPTIONS.map((role) => (
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
                            {(overview.users || []).map((user) => (
                                <div key={user.id} className="saas-admin-list-item">
                                    <div>
                                        <strong>{user.name || user.email}</strong>
                                        <small>{user.email}</small>
                                        <small>
                                            {(user.memberships || []).map((membership) => `${membership.tenantId}:${membership.role}`).join(' · ') || 'sin membresias'}
                                        </small>
                                    </div>
                                    <div className="saas-admin-list-actions">
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
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="saas-admin-card saas-admin-card--full">
                        <h3>Configuracion por empresa</h3>
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
                </div>
            </div>
        </div>
    );
}
