import React from 'react';
import { SaasEntityPage } from '../components/layout';
import {
    PERMISSION_DESCRIPTIONS,
    PERMISSION_GROUPS,
    buildPermissionMatrixGroups
} from '../helpers/permissionMatrix.helpers';

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

function buildRoleMatrixGroups(rolePermissionOptions = [], permissionLabelMap = new Map()) {
    const optionMap = new Map();
    (Array.isArray(rolePermissionOptions) ? rolePermissionOptions : []).forEach((permission) => {
        const key = String(permission?.key || '').trim();
        if (!key) return;
        optionMap.set(key, {
            key,
            label: String(permission?.label || permissionLabelMap?.get(key) || key).trim() || key
        });
    });

    const groupedKeys = new Set(PERMISSION_GROUPS.flatMap((group) => group.permissions));
    const groups = PERMISSION_GROUPS
        .map((group) => ({
            ...group,
            permissions: group.permissions
                .filter((permissionKey) => optionMap.has(permissionKey))
                .map((permissionKey) => optionMap.get(permissionKey))
        }))
        .filter((group) => group.permissions.length > 0);

    const fallback = Array.from(optionMap.values())
        .filter((permission) => !groupedKeys.has(permission.key))
        .sort((left, right) => left.label.localeCompare(right.label, 'es', { sensitivity: 'base' }));

    return fallback.length > 0
        ? [...groups, { id: 'other', title: 'OTROS PERMISOS', permissions: fallback }]
        : groups;
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
        openRoleCreate,
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
        sanitizeRoleCode,
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
    const isEditing = rolePanelMode === 'create' || rolePanelMode === 'edit';
    const selectedId = rolePanelMode === 'create' ? '__create_role' : selectedRoleKey || '';
    const rolePermissionGroups = React.useMemo(
        () => buildRoleMatrixGroups(rolePermissionOptions, permissionLabelMap),
        [permissionLabelMap, rolePermissionOptions]
    );

    const rows = React.useMemo(() => roleProfiles.map((profile) => {
        const role = String(profile?.role || '').trim().toLowerCase();
        const label = String(profile?.label || role).trim() || role;
        return {
            id: role,
            role,
            label,
            name: label,
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
        { key: 'role', label: 'Código', width: '20%', minWidth: '180px', sortable: true, hidden: true },
        { key: 'requiredCount', label: 'Requeridos', width: '14%', minWidth: '130px', sortable: true, hidden: true },
        { key: 'optionalCount', label: 'Opcionales', width: '14%', minWidth: '130px', sortable: true, hidden: true },
        { key: 'blockedCount', label: 'Bloqueados', width: '14%', minWidth: '130px', sortable: true, hidden: true },
        { key: 'status', label: 'Estado', width: '14%', minWidth: '120px', sortable: true }
    ], []);

    const filters = React.useMemo(() => [
        { key: 'name', label: 'Nombre', type: 'text' },
        { key: 'role', label: 'Código', type: 'text' },
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
                    <p>Podrás revisar su detalle y ajustar permisos si tienes acceso de superadmin.</p>
                </div>
            );
        }

        return (
            <>
                <div className="saas-admin-detail-grid">
                    <div className="saas-admin-detail-field"><span>CÓDIGO</span><strong>{selectedRoleProfile.role}</strong></div>
                    <div className="saas-admin-detail-field"><span>Etiqueta</span><strong>{selectedRoleProfile.label || selectedRoleProfile.role}</strong></div>
                    <div className="saas-admin-detail-field"><span>Permisos obligatorios</span><strong>{Array.isArray(selectedRoleProfile.required) ? selectedRoleProfile.required.length : 0}</strong></div>
                    <div className="saas-admin-detail-field"><span>Permisos opcionales</span><strong>{Array.isArray(selectedRoleProfile.optional) ? selectedRoleProfile.optional.length : 0}</strong></div>
                    <div className="saas-admin-detail-field"><span>Permisos bloqueados</span><strong>{Array.isArray(selectedRoleProfile.blocked) ? selectedRoleProfile.blocked.length : 0}</strong></div>
                    <div className="saas-admin-detail-field"><span>ESTADO</span><strong>{selectedRoleProfile.active === false ? 'Inactivo' : 'Activo'}</strong></div>
                </div>
                <PermissionList title="Obligatorios" permissions={selectedRoleProfile.required} permissionLabelMap={permissionLabelMap} />
                <PermissionList title="Opcionales" permissions={selectedRoleProfile.optional} permissionLabelMap={permissionLabelMap} />
                <PermissionList title="Bloqueados" permissions={selectedRoleProfile.blocked} permissionLabelMap={permissionLabelMap} />
            </>
        );
    }, [permissionLabelMap, selectedRoleProfile]);

    const renderForm = React.useCallback(({ close: requestClose } = {}) => (
        <>
            <div className="saas-admin-form-row">
                <input
                    value={roleForm.role || ''}
                    onChange={(event) => setRoleForm?.((prev) => ({ ...prev, role: sanitizeRoleCode?.(event.target.value) || '' }))}
                    placeholder="Código del rol (ej: support_manager)"
                    disabled={busy || rolePanelMode !== 'create'}
                />
                <input
                    value={roleForm.label || ''}
                    onChange={(event) => setRoleForm?.((prev) => ({ ...prev, label: event.target.value }))}
                    placeholder="Etiqueta visible"
                    disabled={busy}
                />
            </div>
            <div className="saas-admin-modules">
                <label className="saas-admin-module-toggle">
                    <input
                        type="checkbox"
                        checked={roleForm.active !== false}
                        onChange={(event) => setRoleForm?.((prev) => ({ ...prev, active: event.target.checked }))}
                        disabled={busy || (rolePanelMode === 'edit' && selectedRoleProfile?.isSystem === true)}
                    />
                    <span>Rol activo</span>
                </label>
            </div>
            <div className="saas-admin-related-block">
                <h4>Matriz de permisos</h4>
                <div className="saas-admin-empty-inline">
                    Usa el mismo orden del editor de usuarios: primero permisos de lectura, luego permisos de gestion.
                    Obligatorio siempre viene con el rol, Opcional se puede otorgar por usuario, Bloqueado nunca se puede asignar.
                </div>
                <div className="saas-admin-permission-groups">
                    {rolePermissionGroups.map((group) => {
                        const groupPermissionKeys = group.permissions.map((permission) => permission.key);
                        const activeCount = groupPermissionKeys.filter((permissionKey) => (
                            Array.isArray(roleForm.required) && roleForm.required.includes(permissionKey)
                        ) || (
                            Array.isArray(roleForm.optional) && roleForm.optional.includes(permissionKey)
                        ) || (
                            Array.isArray(roleForm.blocked) && roleForm.blocked.includes(permissionKey)
                        )).length;
                        return (
                            <details key={`role_permission_group_${group.id}`} className="saas-admin-permission-group" open>
                                <summary>
                                    <span>{group.title}</span>
                                    <small>{activeCount}/{group.permissions.length} definidos</small>
                                </summary>
                                <div className="saas-admin-permission-list">
                                    {group.permissions.map((permission) => {
                                        const permissionKey = String(permission?.key || '').trim();
                                        const isRequired = Array.isArray(roleForm.required) && roleForm.required.includes(permissionKey);
                                        const isOptional = Array.isArray(roleForm.optional) && roleForm.optional.includes(permissionKey);
                                        const isBlocked = Array.isArray(roleForm.blocked) && roleForm.blocked.includes(permissionKey);
                                        const hasSelection = isRequired || isOptional || isBlocked;
                                        const description = PERMISSION_DESCRIPTIONS[permissionKey] || 'Permiso granular del tenant.';

                                        return (
                                            <div
                                                key={`role_permission_matrix_${permissionKey}`}
                                                className={[
                                                    'saas-admin-permission-toggle',
                                                    'saas-admin-permission-toggle--matrix',
                                                    hasSelection ? 'is-active' : '',
                                                    isRequired ? 'is-required' : '',
                                                    isOptional ? 'is-optional' : '',
                                                    isBlocked ? 'is-blocked' : ''
                                                ].filter(Boolean).join(' ')}
                                                role="status"
                                            >
                                                <span className="saas-admin-permission-body">
                                                    <span className="saas-admin-permission-title-row">
                                                        <strong>{permission.label || permissionKey}</strong>
                                                    </span>
                                                    <small>{description}</small>
                                                    <code>{permissionKey}</code>
                                                </span>
                                                <div className="saas-admin-inline-checks">
                                                    <label className={`saas-admin-role-permission-chip saas-admin-role-permission-chip--required${isRequired ? ' is-selected' : ''}`.trim()}>
                                                        <input type="checkbox" checked={isRequired} onChange={(event) => toggleRolePermission?.('required', permissionKey, event.target.checked)} disabled={busy} />
                                                        <small>Obligatorio</small>
                                                    </label>
                                                    <label className={`saas-admin-role-permission-chip saas-admin-role-permission-chip--optional${isOptional ? ' is-selected' : ''}`.trim()}>
                                                        <input type="checkbox" checked={isOptional} onChange={(event) => toggleRolePermission?.('optional', permissionKey, event.target.checked)} disabled={busy} />
                                                        <small>Opcional</small>
                                                    </label>
                                                    <label className={`saas-admin-role-permission-chip saas-admin-role-permission-chip--blocked${isBlocked ? ' is-selected' : ''}`.trim()}>
                                                        <input type="checkbox" checked={isBlocked} onChange={(event) => toggleRolePermission?.('blocked', permissionKey, event.target.checked)} disabled={busy} />
                                                        <small>Bloqueado</small>
                                                    </label>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </details>
                        );
                    })}
                </div>
            </div>
            <div className="saas-admin-form-row saas-admin-form-row--actions">
                <button type="button" disabled={busy || !String(roleForm.role || selectedRoleKey || '').trim()} onClick={saveRoleProfile}>
                    {rolePanelMode === 'create' ? 'Crear rol' : 'Guardar cambios'}
                </button>
                <button type="button" className="saas-btn-cancel" disabled={busy} onClick={() => { void requestClose?.(); }}>Volver</button>
            </div>
        </>
    ), [
        busy,
        roleForm,
        rolePanelMode,
        rolePermissionGroups,
        sanitizeRoleCode,
        saveRoleProfile,
        selectedRoleKey,
        selectedRoleProfile,
        setRoleForm,
        toggleRolePermission
    ]);

    const detailActions = React.useMemo(() => {
        if (rolePanelMode !== 'view' || !selectedRoleProfile || !canManageRoles) return null;
        return <button type="button" disabled={busy} onClick={openRoleEdit}>Editar</button>;
    }, [busy, canManageRoles, openRoleEdit, rolePanelMode, selectedRoleProfile]);

    if (!isRolesSection) return null;

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
            searchPlaceholder="Buscar rol por nombre, código o estado..."
            actions={[
                { key: 'reload', label: sectionError ? 'Reintentar' : 'Recargar', onClick: () => (typeof forceReload === 'function' ? forceReload(lazySectionId) : loadAccessCatalog?.()), disabled: busy || sectionLoading || typeof loadAccessCatalog !== 'function' },
                ...(canManageRoles ? [{ key: 'create', label: 'Nuevo rol', onClick: openRoleCreate, disabled: busy }] : [])
            ]}
            filters={filters}
            detailTitle={rolePanelMode === 'create' ? 'Nuevo rol' : rolePanelMode === 'edit' ? `Editando rol: ${roleForm.role || selectedRoleKey}` : selectedRoleProfile?.label || selectedRoleProfile?.role || 'Rol'}
            detailSubtitle={isEditing ? 'Define permisos obligatorios, opcionales y bloqueados por perfil.' : 'Catálogo global de perfiles de acceso.'}
            detailActions={detailActions}
        />
    );
}

export default React.memo(RoleProfilesSection);
