import React from 'react';
import { SaasEntityPage } from '../components/layout';
import {
    PERMISSION_DESCRIPTIONS,
    buildPermissionMatrixGroups
} from '../helpers/permissionMatrix.helpers';

const OPTIONAL_PERMISSION_CATEGORIES = Object.freeze([
    {
        id: 'customers',
        title: 'CLIENTES',
        permissions: [
            ['tenant.customers.manage', 'Editar clientes'],
            ['tenant.assets.upload', 'Subir archivos']
        ]
    },
    {
        id: 'campaigns',
        title: 'CAMPANAS',
        permissions: [
            ['tenant.campaigns.read', 'Ver campanas'],
            ['tenant.campaigns.manage', 'Crear y enviar campanas']
        ]
    },
    {
        id: 'patty',
        title: 'IA / PATTY',
        permissions: [
            ['tenant.chat.assign_autonomous', 'Cambiar modo autonomo Patty'],
            ['tenant.ai.manage', 'Gestionar asistentes IA']
        ]
    },
    {
        id: 'meta',
        title: 'PLANTILLAS META',
        permissions: [
            ['tenant.meta_templates.read', 'Ver plantillas Meta'],
            ['tenant.meta_templates.manage', 'Gestionar plantillas Meta']
        ]
    },
    {
        id: 'labels-zones',
        title: 'ETIQUETAS Y ZONAS',
        permissions: [
            ['tenant.labels.manage', 'Gestionar etiquetas'],
            ['tenant.zones.read', 'Ver zonas de cobertura'],
            ['tenant.zones.manage', 'Gestionar zonas de cobertura']
        ]
    },
    {
        id: 'kpis',
        title: 'KPIs',
        permissions: [
            ['tenant.kpis.read', 'Ver metricas e indicadores']
        ]
    },
    {
        id: 'email',
        title: 'CORREO',
        permissions: [
            ['tenant.email_templates.read', 'Ver plantillas de correo'],
            ['tenant.email_templates.manage', 'Editar plantillas de correo'],
            ['tenant.brand.read', 'Ver identidad de marca'],
            ['tenant.brand.manage', 'Editar identidad de marca']
        ]
    },
    {
        id: 'quick-replies',
        title: 'RESPUESTAS RAPIDAS',
        permissions: [
            ['tenant.quick_replies.manage', 'Gestionar respuestas rapidas']
        ]
    },
    {
        id: 'devices-audit',
        title: 'SEGURIDAD',
        permissions: [
            ['devices:view_all', 'Ver dispositivos del equipo'],
            ['devices:revoke_all', 'Revocar dispositivos de otros'],
            ['tenant.audit.read', 'Ver auditoria de seguridad']
        ]
    }
]);

function getRoleDisplayLabel(role = '', fallback = '') {
    const cleanRole = String(role || '').trim().toLowerCase();
    const cleanFallback = String(fallback || '').trim();
    if (cleanFallback && cleanFallback.toLowerCase() !== cleanRole) return cleanFallback;
    return cleanFallback || cleanRole || 'Rol';
}

function PermissionList({ title, permissions = [], permissionLabelMap }) {
    const items = Array.isArray(permissions) ? permissions : [];
    const groups = buildPermissionMatrixGroups(items, permissionLabelMap);

    return (
        <div className="saas-admin-related-block">
            <h4>{title}</h4>
            <div className="saas-admin-related-list">
                {items.length === 0 ? (
                    <div className="saas-admin-related-row" role="status">
                        <span>Sin permisos.</span>
                    </div>
                ) : null}
                {groups.map((group) => (
                    <details key={`${title}_${group.id}`} className="saas-admin-permission-group" open>
                        <summary>
                            <span>{group.title}</span>
                            <small>{group.permissions.length}</small>
                        </summary>
                        <div className="saas-admin-permission-list">
                            {group.permissions.map((permissionKey) => (
                                <div key={`${title}_${permissionKey}`} className="saas-admin-related-row" role="status">
                                    <span>{permissionLabelMap?.get(permissionKey) || permissionKey}</span>
                                    <small>{permissionKey}</small>
                                </div>
                            ))}
                        </div>
                    </details>
                ))}
            </div>
        </div>
    );
}

function buildOptionalPermissionGroups({
    rolePermissionOptions = [],
    permissionLabelMap = new Map(),
    required = []
} = {}) {
    const optionMap = new Map();
    (Array.isArray(rolePermissionOptions) ? rolePermissionOptions : []).forEach((permission) => {
        const key = String(permission?.key || '').trim();
        if (!key) return;
        optionMap.set(key, {
            key,
            label: String(permission?.label || permissionLabelMap?.get(key) || key).trim() || key
        });
    });

    const requiredSet = new Set((Array.isArray(required) ? required : [])
        .map((entry) => String(entry || '').trim())
        .filter(Boolean));

    return OPTIONAL_PERMISSION_CATEGORIES
        .map((group) => ({
            ...group,
            permissions: group.permissions
                .map(([permissionKey, label]) => {
                    const key = String(permissionKey || '').trim();
                    if (!optionMap.has(key) || requiredSet.has(key)) return null;
                    const option = optionMap.get(key);
                    return {
                        ...option,
                        label: label || option.label || key,
                        description: PERMISSION_DESCRIPTIONS[key] || 'Permiso opcional configurable para este rol.'
                    };
                })
                .filter(Boolean)
        }))
        .filter((group) => group.permissions.length > 0);
}

function RoleProfilesSection(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const {
        isRolesSection,
        loadAccessCatalog,
        busy,
        canManageRoles,
        ensureSectionData = null,
        isLoading = null,
        getError = null,
        getReloadToken = null,
        forceReload = null,
        roleProfiles = [],
        selectedRoleKey,
        rolePanelMode,
        openRoleView,
        selectedRoleProfile,
        openRoleEdit,
        permissionLabelMap,
        rolePermissionOptions = [],
        roleForm = {},
        setRoleForm,
        toggleRolePermission,
        saveRoleProfile,
        cancelRoleEdit,
        setSelectedRoleKey,
        setRolePanelMode
    } = context;

    const lazySectionId = 'roles';
    const sectionReloadToken = typeof getReloadToken === 'function' ? getReloadToken(lazySectionId) : 0;
    const sectionLoading = typeof isLoading === 'function' && isLoading(lazySectionId);
    const sectionError = typeof getError === 'function' ? getError(lazySectionId) : '';
    const isEditing = rolePanelMode === 'edit';
    const selectedId = selectedRoleKey || '';
    const activeBasePermissions = roleForm.required || selectedRoleProfile?.required || [];
    const activeOptionalPermissions = roleForm.optional || selectedRoleProfile?.optional || [];
    const rolePermissionGroups = React.useMemo(
        () => buildOptionalPermissionGroups({
            rolePermissionOptions,
            permissionLabelMap,
            required: activeBasePermissions
        }),
        [activeBasePermissions, permissionLabelMap, rolePermissionOptions]
    );

    const rows = React.useMemo(() => roleProfiles.map((profile) => {
        const role = String(profile?.role || '').trim().toLowerCase();
        const label = String(profile?.label || role).trim() || role;
        const displayLabel = getRoleDisplayLabel(role, label);

        return {
            id: role,
            role,
            label: displayLabel,
            name: displayLabel,
            scope: 'Global',
            permissions: (Array.isArray(profile?.required) ? profile.required.length : 0) + (Array.isArray(profile?.optional) ? profile.optional.length : 0),
            updatedAt: String(profile?.updatedAt || '-').trim() || '-',
            requiredCount: Array.isArray(profile?.required) ? profile.required.length : 0,
            optionalCount: Array.isArray(profile?.optional) ? profile.optional.length : 0,
            blockedCount: Array.isArray(profile?.blocked) ? profile.blocked.length : 0,
            status: profile?.active === false ? 'Inactivo' : 'Activo',
            raw: profile
        };
    }), [roleProfiles]);

    const columns = React.useMemo(() => [
        { key: 'name', label: 'Nombre', width: '24%', minWidth: '220px', sortable: true },
        { key: 'scope', label: 'Scope', width: '16%', minWidth: '140px', sortable: true, hidden: true },
        { key: 'permissions', label: 'Permisos', width: '14%', minWidth: '130px', sortable: true, hidden: true },
        { key: 'updatedAt', label: 'Actualizado', width: '16%', minWidth: '150px', sortable: true, hidden: true },
        { key: 'role', label: 'Codigo', width: '20%', minWidth: '180px', sortable: true, hidden: true },
        { key: 'requiredCount', label: 'Base', width: '14%', minWidth: '130px', sortable: true, hidden: true },
        { key: 'optionalCount', label: 'Opcionales', width: '14%', minWidth: '130px', sortable: true, hidden: true },
        { key: 'blockedCount', label: 'Bloqueados', width: '14%', minWidth: '130px', sortable: true, hidden: true },
        { key: 'status', label: 'Estado', width: '14%', minWidth: '120px', sortable: true }
    ], []);

    const filters = React.useMemo(() => [
        { key: 'name', label: 'Nombre', type: 'text' },
        { key: 'role', label: 'Codigo', type: 'text' },
        { key: 'status', label: 'Estado', type: 'option', options: [{ value: 'Activo', label: 'Activo' }, { value: 'Inactivo', label: 'Inactivo' }] },
        { key: 'scope', label: 'Scope', type: 'option', options: [{ value: 'Global', label: 'Global' }] }
    ], []);

    React.useEffect(() => {
        if (!isRolesSection) return;
        if (typeof ensureSectionData !== 'function') {
            if (typeof loadAccessCatalog === 'function' && canManageRoles) {
                loadAccessCatalog().catch(() => {});
            }
            return;
        }
        void ensureSectionData(
            lazySectionId,
            () => loadAccessCatalog?.(),
            {
                canLoad: Boolean(canManageRoles && typeof loadAccessCatalog === 'function'),
                forceReload: sectionReloadToken > 0,
                reloadToken: sectionReloadToken,
                deps: ['access_catalog']
            }
        );
    }, [canManageRoles, ensureSectionData, isRolesSection, loadAccessCatalog, sectionReloadToken]);

    const close = React.useCallback(() => {
        if (isEditing) {
            cancelRoleEdit?.();
            return;
        }
        setSelectedRoleKey?.('');
        setRolePanelMode?.('view');
    }, [cancelRoleEdit, isEditing, setRolePanelMode, setSelectedRoleKey]);

    const renderDetail = React.useCallback(() => {
        if (!selectedRoleProfile) {
            return (
                <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                    <h4>Selecciona un rol</h4>
                    <p>Podras revisar sus permisos base y configurar permisos opcionales si tienes acceso.</p>
                </div>
            );
        }

        const roleLabel = getRoleDisplayLabel(selectedRoleProfile.role, selectedRoleProfile.label);

        return (
            <>
                <div className="saas-admin-detail-grid">
                    <div className="saas-admin-detail-field"><span>ROL</span><strong>{roleLabel}</strong></div>
                    <div className="saas-admin-detail-field"><span>Codigo</span><strong>{selectedRoleProfile.role}</strong></div>
                    <div className="saas-admin-detail-field"><span>Permisos base</span><strong>{Array.isArray(selectedRoleProfile.required) ? selectedRoleProfile.required.length : 0}</strong></div>
                    <div className="saas-admin-detail-field"><span>Permisos opcionales</span><strong>{Array.isArray(selectedRoleProfile.optional) ? selectedRoleProfile.optional.length : 0}</strong></div>
                    <div className="saas-admin-detail-field"><span>ESTADO</span><strong>{selectedRoleProfile.active === false ? 'Inactivo' : 'Activo'}</strong></div>
                </div>
                <PermissionList title="Permisos base (no editables)" permissions={selectedRoleProfile.required} permissionLabelMap={permissionLabelMap} />
                <PermissionList title="Permisos opcionales activos" permissions={selectedRoleProfile.optional} permissionLabelMap={permissionLabelMap} />
            </>
        );
    }, [permissionLabelMap, selectedRoleProfile]);

    const renderForm = React.useCallback(({ close: requestClose } = {}) => {
        const roleCode = String(roleForm.role || selectedRoleProfile?.role || selectedRoleKey || '').trim();
        const roleLabel = getRoleDisplayLabel(roleCode, roleForm.label || selectedRoleProfile?.label || roleCode);
        const optionalSet = new Set((Array.isArray(activeOptionalPermissions) ? activeOptionalPermissions : [])
            .map((entry) => String(entry || '').trim())
            .filter(Boolean));

        return (
            <>
                <div className="saas-admin-related-block">
                    <h4>Nombre visible del rol</h4>
                    <div className="saas-admin-empty-inline">
                        Este nombre se muestra en Usuarios y en el panel. El codigo interno se mantiene estable para no romper permisos ni sesiones.
                    </div>
                    <div className="saas-admin-form-row">
                        <label className="saas-admin-field">
                            <span>Nombre visible</span>
                            <input
                                value={roleForm.label || ''}
                                onChange={(event) => setRoleForm?.((prev) => ({ ...prev, label: event.target.value }))}
                                placeholder={roleLabel}
                                disabled={busy}
                            />
                            <small>Ejemplo: Dueno de negocio, Administrador, Ventas.</small>
                        </label>
                        <label className="saas-admin-field">
                            <span>Codigo interno</span>
                            <input value={roleCode || '-'} disabled />
                            <small>No se edita: este codigo mantiene la compatibilidad del sistema.</small>
                        </label>
                    </div>
                </div>

                <div className="saas-admin-detail-grid">
                    <div className="saas-admin-detail-field"><span>ROL</span><strong>{roleLabel}</strong></div>
                    <div className="saas-admin-detail-field"><span>Codigo</span><strong>{roleCode || '-'}</strong></div>
                    <div className="saas-admin-detail-field"><span>Permisos base</span><strong>{Array.isArray(activeBasePermissions) ? activeBasePermissions.length : 0}</strong></div>
                    <div className="saas-admin-detail-field"><span>Opcionales activos</span><strong>{optionalSet.size}</strong></div>
                </div>

                <PermissionList title="Permisos base (no editables)" permissions={activeBasePermissions} permissionLabelMap={permissionLabelMap} />

                <div className="saas-admin-related-block">
                    <h4>Permisos opcionales (configurables)</h4>
                    <div className="saas-admin-empty-inline">
                        Activa o desactiva permisos adicionales para este rol. Los permisos base permanecen siempre activos.
                    </div>
                    <div className="saas-admin-permission-groups">
                        {rolePermissionGroups.length === 0 ? (
                            <div className="saas-admin-related-row" role="status">
                                <span>No hay permisos opcionales disponibles para este rol.</span>
                            </div>
                        ) : null}
                        {rolePermissionGroups.map((group) => {
                            const activeCount = group.permissions.filter((permission) => optionalSet.has(permission.key)).length;

                            return (
                                <details key={`role_optional_group_${group.id}`} className="saas-admin-permission-group" open>
                                    <summary>
                                        <span>{group.title}</span>
                                        <small>{activeCount}/{group.permissions.length} activos</small>
                                    </summary>
                                    <div className="saas-admin-permission-list">
                                        {group.permissions.map((permission) => {
                                            const permissionKey = String(permission?.key || '').trim();
                                            const isOptional = optionalSet.has(permissionKey);

                                            return (
                                                <label
                                                    key={`role_optional_permission_${permissionKey}`}
                                                    className={[
                                                        'saas-admin-permission-toggle',
                                                        'saas-admin-permission-toggle--matrix',
                                                        isOptional ? 'is-active is-optional' : ''
                                                    ].filter(Boolean).join(' ')}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isOptional}
                                                        onChange={(event) => toggleRolePermission?.('optional', permissionKey, event.target.checked)}
                                                        disabled={busy}
                                                    />
                                                    <span className="saas-admin-permission-body">
                                                        <span className="saas-admin-permission-title-row">
                                                            <strong>{permission.label || permissionKey}</strong>
                                                            <small>{isOptional ? 'Activo' : 'Inactivo'}</small>
                                                        </span>
                                                        <small>{permission.description}</small>
                                                        <code>{permissionKey}</code>
                                                    </span>
                                                    <span className="saas-admin-permission-switch" aria-hidden="true" />
                                                </label>
                                            );
                                        })}
                                    </div>
                                </details>
                            );
                        })}
                    </div>
                </div>

                <div className="saas-admin-form-row saas-admin-form-row--actions">
                    <button type="button" disabled={busy || !roleCode} onClick={saveRoleProfile}>
                        Guardar rol
                    </button>
                    <button type="button" className="saas-btn-cancel" disabled={busy} onClick={() => { void requestClose?.(); }}>
                        Cancelar
                    </button>
                </div>
            </>
        );
    }, [
        activeBasePermissions,
        activeOptionalPermissions,
        busy,
        permissionLabelMap,
        roleForm.label,
        roleForm.role,
        rolePermissionGroups,
        saveRoleProfile,
        selectedRoleKey,
        selectedRoleProfile?.label,
        selectedRoleProfile?.role,
        setRoleForm,
        toggleRolePermission
    ]);

    const detailActions = React.useMemo(() => {
        if (rolePanelMode === 'edit' && selectedRoleProfile && canManageRoles) {
            return (
                <>
                    <button type="button" disabled={busy || !String(roleForm?.role || selectedRoleKey || '').trim()} onClick={saveRoleProfile}>
                        Guardar rol
                    </button>
                    <button type="button" className="saas-btn-cancel" disabled={busy} onClick={cancelRoleEdit}>
                        Cancelar
                    </button>
                </>
            );
        }
        if (rolePanelMode !== 'view' || !selectedRoleProfile || !canManageRoles) return null;
        return <button type="button" disabled={busy} onClick={openRoleEdit}>Editar</button>;
    }, [busy, canManageRoles, cancelRoleEdit, openRoleEdit, roleForm?.role, rolePanelMode, saveRoleProfile, selectedRoleKey, selectedRoleProfile]);

    if (!isRolesSection) return null;

    const detailRoleLabel = getRoleDisplayLabel(
        roleForm.role || selectedRoleProfile?.role || selectedRoleKey,
        roleForm.label || selectedRoleProfile?.label || selectedRoleProfile?.role || selectedRoleKey || 'Rol'
    );

    return (
        <SaasEntityPage
            id="saas_roles"
            sectionKey="roles"
            title="Roles y accesos"
            rows={rows}
            columns={columns}
            selectedId={selectedId}
            onSelect={(row) => openRoleView?.(row?.id)}
            onClose={close}
            renderDetail={renderDetail}
            renderForm={renderForm}
            mode={isEditing ? 'form' : 'detail'}
            dirty={isEditing}
            loading={sectionLoading}
            emptyText={sectionError || 'No hay perfiles de rol cargados.'}
            searchPlaceholder="Buscar rol por nombre, codigo o estado..."
            actions={[
                { key: 'reload', label: sectionError ? 'Reintentar' : 'Recargar', onClick: () => (typeof forceReload === 'function' ? forceReload(lazySectionId) : loadAccessCatalog?.()), disabled: busy || sectionLoading || typeof loadAccessCatalog !== 'function' }
            ]}
            filters={filters}
            detailTitle={isEditing ? `Editando rol: ${detailRoleLabel}` : detailRoleLabel}
            detailSubtitle={isEditing ? 'Edita el nombre visible y los permisos opcionales. El codigo interno y los permisos base no se pueden quitar.' : 'Permisos base y opcionales por rol.'}
            detailActions={detailActions}
        />
    );
}

export default React.memo(RoleProfilesSection);
