import React from 'react';
import useUiFeedback from '../../../app/ui-feedback/useUiFeedback';
import ImageDropInput from '../components/panel/ImageDropInput';
import { SaasEntityPage } from '../components/layout';
import {
    PERMISSION_DESCRIPTIONS,
    PERMISSION_GROUPS,
    SENSITIVE_SELLER_PERMISSIONS,
    buildPermissionSet,
    getPackPermissionSet,
    getRoleProfile
} from '../helpers/permissionMatrix.helpers';

function text(value) {
    return String(value ?? '').trim();
}

const buildSet = buildPermissionSet;

function UsersSection(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const {
        selectedSectionId,
        tenantScopeLocked,
        refreshOverview,
        busy,
        canManageUsers,
        openUserCreate,
        selectedTenantId,
        tenantOptions = [],
        hasAccessCatalogData,
        loadingAccessCatalog,
        scopedUsers = [],
        selectedUserId,
        currentUserId = '',
        userPanelMode,
        openUserView,
        selectedUser,
        canEditSelectedUser,
        canToggleSelectedUserStatus,
        toUserDisplayName = (user) => user?.name || user?.email || user?.id || '-',
        openUserEdit,
        runAction,
        requestJson,
        refreshCurrentUserPermissions,
        canEditScopeInUserForm,
        settingsTenantId,
        openTenantFromUserMembership,
        toTenantDisplayName = (tenant) => tenant?.name || tenant?.id || '-',
        formatDateTimeLabel = (value) => value || '-',
        userForm = {},
        setUserForm,
        roleOptions = [],
        roleProfiles = [],
        canEditRoleInUserForm,
        canEditOptionalAccess,
        allowedOptionalPermissionsForUserFormRole = [],
        permissionLabelMap = new Map(),
        getOptionalPermissionKeysForRole = () => new Set(),
        accessPackOptions = [],
        accessPackLabelMap = new Map(),
        getAllowedPackIdsForRole = () => new Set(),
        allowedPackIdsForUserFormRole = new Set(),
        canConfigureOptionalAccessInUserForm,
        roleLabelMap = new Map(),
        sanitizeMemberships = (items) => (Array.isArray(items) ? items : []),
        setSelectedUserId,
        setUserPanelMode,
        cancelUserEdit,
        handleFormImageUpload,
        buildInitials = (label) => text(label).slice(0, 2).toUpperCase(),
        activeTenantId,
        packId = ''
    } = context;

    const selectedEntityId = userPanelMode === 'create' ? '__create_user__' : selectedUserId;
    const isEditing = userPanelMode === 'create' || userPanelMode === 'edit';
    const { notify } = useUiFeedback();
    const [permissionsAudit, setPermissionsAudit] = React.useState(null);
    const [permissionsAuditLoading, setPermissionsAuditLoading] = React.useState(false);
    const [permissionsAuditError, setPermissionsAuditError] = React.useState('');
    const [showEffectivePermissions, setShowEffectivePermissions] = React.useState(false);

    const rows = React.useMemo(() => scopedUsers.map((user) => {
        const memberships = sanitizeMemberships(user?.memberships || []);
        return {
            id: user.id,
            name: toUserDisplayName(user),
            email: user.email || '-',
            role: user.roleLabel || user.role || '-',
            status: user.active === false ? 'Inactivo' : 'Activo',
            memberships: String(memberships.length),
            createdAt: formatDateTimeLabel(user.createdAt),
            updatedAt: formatDateTimeLabel(user.updatedAt),
            raw: user
        };
    }), [formatDateTimeLabel, sanitizeMemberships, scopedUsers, toUserDisplayName]);

    const columns = React.useMemo(() => [
        { key: 'name', label: 'Nombre', width: '24%', minWidth: '220px', sortable: true },
        { key: 'email', label: 'Correo', width: '28%', minWidth: '260px', sortable: true },
        { key: 'role', label: 'Rol', width: '18%', minWidth: '150px', sortable: true },
        { key: 'status', label: 'Estado', width: '14%', minWidth: '120px', sortable: true },
        { key: 'memberships', label: 'Empresas', width: '12%', minWidth: '120px', sortable: true, hidden: true },
        { key: 'createdAt', label: 'Creado', width: '18%', minWidth: '160px', sortable: true, hidden: true },
        { key: 'updatedAt', label: 'Actualizado', width: '18%', minWidth: '160px', sortable: true, hidden: true }
    ], []);

    const filters = React.useMemo(() => [
        {
            key: 'status',
            label: 'Estado',
            type: 'select',
            options: [
                { value: 'Activo', label: 'Activo' },
                { value: 'Inactivo', label: 'Inactivo' }
            ]
        },
        {
            key: 'role',
            label: 'Rol',
            type: 'select',
            options: roleOptions.map((role) => ({
                value: roleLabelMap.get(text(role).toLowerCase()) || role,
                label: roleLabelMap.get(text(role).toLowerCase()) || role
            }))
        }
    ], [roleLabelMap, roleOptions]);

    const close = React.useCallback(() => {
        if (isEditing) {
            cancelUserEdit?.();
            return;
        }
        setSelectedUserId?.('');
        setUserPanelMode?.('view');
    }, [cancelUserEdit, isEditing, setSelectedUserId, setUserPanelMode]);

    React.useEffect(() => {
        if (!canConfigureOptionalAccessInUserForm) return;
        const currentPacks = Array.isArray(userForm.permissionPacks)
            ? userForm.permissionPacks.map((entry) => text(entry)).filter(Boolean)
            : [];
        if (currentPacks.length === 0) return;
        const packedPermissionSet = getPackPermissionSet(currentPacks, accessPackOptions);
        setUserForm?.((prev) => {
            const nextGrants = new Set(
                (Array.isArray(prev.permissionGrants) ? prev.permissionGrants : [])
                    .map((entry) => text(entry))
                    .filter(Boolean)
            );
            packedPermissionSet.forEach((permissionKey) => nextGrants.add(permissionKey));
            return {
                ...prev,
                permissionPacks: [],
                permissionGrants: Array.from(nextGrants)
            };
        });
    }, [accessPackOptions, canConfigureOptionalAccessInUserForm, setUserForm, userForm.permissionPacks]);

    React.useEffect(() => {
        let cancelled = false;
        const cleanUserId = text(selectedUser?.id || '');
        const tenantId = text(
            userForm.tenantId
            || selectedUser?.memberships?.find?.((entry) => entry?.active !== false)?.tenantId
            || selectedUser?.memberships?.[0]?.tenantId
            || settingsTenantId
            || selectedTenantId
            || activeTenantId
        );

        setShowEffectivePermissions(false);
        if (!cleanUserId || userPanelMode !== 'edit' || !canConfigureOptionalAccessInUserForm || typeof requestJson !== 'function') {
            setPermissionsAudit(null);
            setPermissionsAuditError('');
            setPermissionsAuditLoading(false);
            return () => {
                cancelled = true;
            };
        }
        if (!tenantId) {
            setPermissionsAudit(null);
            setPermissionsAuditError('Selecciona una empresa para auditar permisos.');
            setPermissionsAuditLoading(false);
            return () => {
                cancelled = true;
            };
        }

        setPermissionsAuditLoading(true);
        setPermissionsAuditError('');
        requestJson(`/api/tenant/users/${encodeURIComponent(cleanUserId)}/permissions-audit?tenantId=${encodeURIComponent(tenantId)}`)
            .then((payload) => {
                if (cancelled) return;
                setPermissionsAudit(payload?.audit && typeof payload.audit === 'object' ? payload.audit : null);
            })
            .catch((error) => {
                if (cancelled) return;
                setPermissionsAudit(null);
                setPermissionsAuditError(String(error?.message || 'No se pudo auditar permisos.'));
            })
            .finally(() => {
                if (!cancelled) setPermissionsAuditLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [
        activeTenantId,
        canConfigureOptionalAccessInUserForm,
        requestJson,
        selectedTenantId,
        selectedUser?.id,
        selectedUser?.memberships,
        settingsTenantId,
        userForm.tenantId,
        userPanelMode
    ]);

    const saveUser = React.useCallback(() => runAction?.(
        userPanelMode === 'create' ? 'Usuario creado' : 'Usuario actualizado',
        async () => {
            const membershipsPayload = sanitizeMemberships([
                { tenantId: userForm.tenantId, role: userForm.role, active: true }
            ]);
            const isCreateMode = userPanelMode === 'create' || !selectedUser?.id;
            if (isCreateMode && membershipsPayload.length === 0) {
                throw new Error('Debes asignar al menos una empresa/membresia.');
            }

            const payload = {
                email: userForm.email,
                name: userForm.name,
                active: userForm.active !== false,
                avatarUrl: userForm.avatarUrl || null
            };
            if (isCreateMode || canEditScopeInUserForm) payload.memberships = membershipsPayload;
            if ((isCreateMode && canEditOptionalAccess) || (!isCreateMode && canConfigureOptionalAccessInUserForm)) {
                const packedPermissionSet = getPackPermissionSet(userForm.permissionPacks, accessPackOptions);
                payload.permissionPacks = [];
                payload.permissionGrants = Array.from(new Set([
                    ...(Array.isArray(userForm.permissionGrants) ? userForm.permissionGrants : []),
                    ...Array.from(packedPermissionSet)
                ].map((entry) => text(entry)).filter(Boolean)));
            }
            if (userForm.password) payload.password = userForm.password;

            if (isCreateMode) {
                const createdPayload = await requestJson('/api/admin/saas/users', { method: 'POST', body: payload });
                const createdId = text(createdPayload?.user?.id);
                if (createdId) setSelectedUserId?.(createdId);
                setUserPanelMode?.('view');
                return;
            }

            await requestJson(`/api/admin/saas/users/${encodeURIComponent(selectedUser.id)}`, { method: 'PUT', body: payload });
            const editedCurrentUser = text(selectedUser.id) && text(selectedUser.id) === text(currentUserId);
            if (editedCurrentUser) {
                if (typeof refreshCurrentUserPermissions === 'function') {
                    await refreshCurrentUserPermissions();
                    notify({ type: 'info', message: 'Tu sesion se actualizo con los permisos nuevos.' });
                } else {
                    notify({ type: 'warn', message: 'Usuario actualizado. Vuelve a iniciar sesion para ver tus permisos nuevos.' });
                }
            } else {
                notify({
                    type: 'info',
                    message: `Los cambios aplican cuando ${toUserDisplayName(selectedUser || {})} inicie sesion nuevamente.`
                });
            }
            setUserPanelMode?.('view');
        }
    ), [
        canConfigureOptionalAccessInUserForm,
        canEditOptionalAccess,
        canEditScopeInUserForm,
        accessPackOptions,
        requestJson,
        refreshCurrentUserPermissions,
        runAction,
        sanitizeMemberships,
        selectedUser,
        currentUserId,
        setSelectedUserId,
        setUserPanelMode,
        notify,
        toUserDisplayName,
        userForm,
        userPanelMode
    ]);

    const renderDetail = React.useCallback(() => {
        if (!selectedUser) {
            return (
                <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                    <h4>Selecciona un usuario</h4>
                    <p>El detalle se mostrará aquí. Editar se activa solo por botón.</p>
                </div>
            );
        }
        const memberships = sanitizeMemberships(selectedUser.memberships || []);
        return (
            <>
                {userPanelMode === 'view' && selectedUser && !canEditSelectedUser ? (
                    <div className="saas-admin-empty-inline">
                        No puedes editar este usuario porque tiene el mismo nivel o uno superior al tuyo.
                    </div>
                ) : null}

                <div className="saas-admin-hero">
                    <div className="saas-admin-hero-media">
                        {selectedUser.avatarUrl
                            ? <img src={selectedUser.avatarUrl} alt={toUserDisplayName(selectedUser)} className="saas-admin-hero-image" />
                            : <div className="saas-admin-hero-placeholder">{buildInitials(toUserDisplayName(selectedUser || {}))}</div>}
                    </div>
                    <div className="saas-admin-hero-content">
                        <h4>{toUserDisplayName(selectedUser)}</h4>
                        <p>{selectedUser.email || 'Sin correo'}</p>
                    </div>
                </div>
                <div className="saas-admin-detail-grid">
                    <div className="saas-admin-detail-field"><span>CÓDIGO</span><strong>{selectedUser?.id || '-'}</strong></div>
                    <div className="saas-admin-detail-field"><span>CORREO</span><strong>{selectedUser.email || '-'}</strong></div>
                    <div className="saas-admin-detail-field"><span>Rol</span><strong>{selectedUser.roleLabel || selectedUser.role || '-'}</strong></div>
                    <div className="saas-admin-detail-field"><span>ESTADO</span><strong>{selectedUser.active === false ? 'Inactivo' : 'Activo'}</strong></div>
                    <div className="saas-admin-detail-field"><span>Actualizado</span><strong>{formatDateTimeLabel(selectedUser.updatedAt)}</strong></div>
                </div>

                <div className="saas-admin-related-block">
                    <h4>Empresas vinculadas</h4>
                    <div className="saas-admin-related-list">
                        {memberships.length === 0 ? <div className="saas-admin-empty-inline">Sin membresias activas.</div> : null}
                        {memberships.map((membership, index) => {
                            const tenantLabel = toTenantDisplayName(tenantOptions.find((tenant) => tenant.id === membership.tenantId) || {});
                            return (
                                <button
                                    key={`${selectedUser.id}_membership_view_${index}`}
                                    type="button"
                                    className="saas-admin-related-row"
                                    data-link-label="Abrir empresa"
                                    title={`Abrir empresa ${tenantLabel}`}
                                    aria-label={`Abrir empresa ${tenantLabel}`}
                                    onClick={() => openTenantFromUserMembership?.(membership.tenantId)}
                                >
                                    <span>{tenantLabel}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </>
        );
    }, [
        buildInitials,
        busy,
        canEditSelectedUser,
        canManageUsers,
        canToggleSelectedUserStatus,
        formatDateTimeLabel,
        openTenantFromUserMembership,
        openUserEdit,
        requestJson,
        runAction,
        sanitizeMemberships,
        selectedUser,
        tenantOptions,
        toTenantDisplayName,
        toUserDisplayName,
        userPanelMode
    ]);

    const detailActions = React.useMemo(() => {
        if (userPanelMode !== 'view' || !selectedUser || !canManageUsers) return null;
        return (
            <>
                <button type="button" disabled={busy || !canEditSelectedUser} onClick={openUserEdit}>
                    Editar
                </button>
                <button
                    type="button"
                    disabled={busy || !canToggleSelectedUserStatus}
                    onClick={() => runAction?.('Estado de usuario actualizado', async () => {
                        await requestJson(`/api/admin/saas/users/${encodeURIComponent(selectedUser.id)}`, {
                            method: 'PUT',
                            body: {
                                active: selectedUser.active === false,
                                avatarUrl: selectedUser.avatarUrl || null
                            }
                        });
                    })}
                >
                    {selectedUser.active === false ? 'Activar' : 'Desactivar'}
                </button>
            </>
        );
    }, [
        busy,
        canEditSelectedUser,
        canManageUsers,
        canToggleSelectedUserStatus,
        openUserEdit,
        requestJson,
        runAction,
        selectedUser,
        userPanelMode
    ]);

    const renderForm = React.useCallback(({ close: requestClose } = {}) => {
        if (!canManageUsers || (userPanelMode === 'edit' && !canEditSelectedUser)) {
            return <div className="saas-admin-empty-inline">No tienes permisos para editar este usuario.</div>;
        }
        const selectedRole = text(userForm.role || 'seller').toLowerCase() || 'seller';
        const selectedRoleLabel = roleLabelMap.get(selectedRole) || selectedRole;
        const roleProfile = getRoleProfile(selectedRole, roleProfiles);
        const auditApplies = permissionsAudit && text(permissionsAudit.userId) === text(selectedUser?.id || '');
        const basePermissionSet = buildSet(auditApplies ? permissionsAudit.roleRequired : (roleProfile?.required || []));
        const optionalPermissionSet = buildSet(auditApplies ? permissionsAudit.roleOptional : allowedOptionalPermissionsForUserFormRole);
        const blockedPermissionSet = buildSet(auditApplies ? permissionsAudit.roleBlocked : (roleProfile?.blocked || []));
        const effectivePermissionSet = buildSet(auditApplies ? permissionsAudit.effectivePermissions : (selectedUser?.permissions || []));
        const ignoredGrantSet = buildSet(auditApplies ? permissionsAudit.grantsIgnored : []);
        const directGrantSet = buildSet(userForm.permissionGrants);
        const packedPermissionSet = getPackPermissionSet(userForm.permissionPacks, accessPackOptions);
        const effectivePermissionList = Array.from(effectivePermissionSet)
            .sort((left, right) => String(permissionLabelMap.get(left) || left).localeCompare(String(permissionLabelMap.get(right) || right), 'es', { sensitivity: 'base' }));
        const groupedPermissionKeys = new Set(PERMISSION_GROUPS.flatMap((group) => group.permissions));
        const fallbackPermissionKeys = Array.from(new Set([
            ...Array.from(basePermissionSet),
            ...Array.from(optionalPermissionSet),
            ...Array.from(blockedPermissionSet),
            ...Array.from(directGrantSet),
            ...Array.from(packedPermissionSet)
        ])).filter((permissionKey) => !groupedPermissionKeys.has(permissionKey));
        const permissionGroups = [
            ...PERMISSION_GROUPS,
            ...(fallbackPermissionKeys.length ? [{ id: 'other', title: 'OTROS PERMISOS', permissions: fallbackPermissionKeys }] : [])
        ].map((group) => ({
            ...group,
            permissions: group.permissions.filter((permissionKey) => (
                basePermissionSet.has(permissionKey)
                || optionalPermissionSet.has(permissionKey)
                || blockedPermissionSet.has(permissionKey)
                || directGrantSet.has(permissionKey)
                || packedPermissionSet.has(permissionKey)
            ))
        })).filter((group) => group.permissions.length > 0);
        const togglePermissionGrant = (permissionKey, enabled) => {
            setUserForm?.((prev) => {
                const nextSet = buildSet(prev.permissionGrants);
                if (enabled) nextSet.add(permissionKey);
                else nextSet.delete(permissionKey);
                return { ...prev, permissionGrants: Array.from(nextSet) };
            });
        };
        return (
            <>
                <div className="saas-admin-form-row">
                    <input
                        value={userForm.email || ''}
                        onChange={(event) => setUserForm?.((prev) => ({ ...prev, email: event.target.value }))}
                        placeholder="email"
                        disabled={userPanelMode !== 'create' || busy}
                    />
                    <input
                        value={userForm.name || ''}
                        onChange={(event) => setUserForm?.((prev) => ({ ...prev, name: event.target.value }))}
                        placeholder="Nombre"
                        disabled={busy}
                    />
                </div>
                <div className="saas-admin-form-row">
                    <input
                        type="password"
                        value={userForm.password || ''}
                        onChange={(event) => setUserForm?.((prev) => ({ ...prev, password: event.target.value }))}
                        placeholder={userPanelMode === 'create' ? 'Contraseña inicial' : 'Nueva contraseña opcional'}
                        disabled={busy}
                    />
                    <label className="saas-admin-module-toggle">
                        <input
                            type="checkbox"
                            checked={userForm.active !== false}
                            onChange={(event) => setUserForm?.((prev) => ({ ...prev, active: event.target.checked }))}
                            disabled={busy || (userPanelMode === 'edit' && !canToggleSelectedUserStatus)}
                        />
                        <span>Usuario activo</span>
                    </label>
                </div>
                <div className="saas-admin-form-row">
                    <select
                        value={userForm.tenantId || ''}
                        onChange={(event) => setUserForm?.((prev) => ({ ...prev, tenantId: event.target.value }))}
                        disabled={busy || !canEditScopeInUserForm}
                    >
                        <option value="">Empresa inicial</option>
                        {tenantOptions.map((tenant) => (
                            <option key={tenant.id} value={tenant.id}>{toTenantDisplayName(tenant)}</option>
                        ))}
                    </select>
                    <select
                        value={userForm.role || ''}
                        onChange={(event) => {
                            const nextRole = event.target.value;
                            setUserForm?.((prev) => {
                                const allowedPacks = getAllowedPackIdsForRole(nextRole);
                                const allowedPermissions = getOptionalPermissionKeysForRole(nextRole);
                                const nextPacks = (Array.isArray(prev.permissionPacks) ? prev.permissionPacks : [])
                                    .filter((entry) => allowedPacks.has(text(entry)));
                                const nextGrants = (Array.isArray(prev.permissionGrants) ? prev.permissionGrants : [])
                                    .map((entry) => text(entry))
                                    .filter((permission) => allowedPermissions.has(permission));
                                return {
                                    ...prev,
                                    role: nextRole,
                                    permissionPacks: nextPacks,
                                    permissionGrants: Array.from(new Set(nextGrants))
                                };
                            });
                        }}
                        disabled={busy || !canEditRoleInUserForm}
                    >
                        {roleOptions.map((role) => (
                            <option key={role} value={role}>{roleLabelMap.get(text(role).toLowerCase()) || role}</option>
                        ))}
                    </select>
                </div>
                <div className="saas-admin-form-row">
                    <ImageDropInput
                        label="Reemplazar avatar"
                        disabled={busy}
                        onFile={(file) => handleFormImageUpload?.({
                            file,
                            scope: 'user_avatar',
                            tenantId: userForm.tenantId || settingsTenantId || selectedTenantId || activeTenantId || 'default',
                            onUploaded: (url) => setUserForm?.((prev) => ({ ...prev, avatarUrl: url }))
                        })}
                    />
                </div>
                {userForm.avatarUrl ? (
                    <div className="saas-admin-preview-strip">
                        <img src={userForm.avatarUrl} alt="Avatar usuario" className="saas-admin-preview-thumb" />
                    </div>
                ) : null}

                {canConfigureOptionalAccessInUserForm ? (
                    <div className="saas-admin-related-block">
                        <h4>Accesos opcionales</h4>
                        {loadingAccessCatalog ? <div className="saas-admin-empty-inline">Cargando catalogo de accesos...</div> : null}
                        {!loadingAccessCatalog && !hasAccessCatalogData ? (
                            <div className="saas-admin-empty-inline">No se pudo cargar el catalogo de accesos. Reabre el editor de usuario para reintentar.</div>
                        ) : null}
                        <div className="saas-admin-optional-access-grid saas-admin-optional-access-grid--single">
                            <div className="saas-admin-optional-access-column">
                                <small className="saas-admin-optional-access-title">Permisos por categoria</small>
                                <div className="saas-admin-empty-inline">
                                    Los permisos del rol base aparecen bloqueados. Los adicionales se pueden activar uno por uno o por grupo.
                                    Si el usuario tenia paquetes antiguos, al guardar se convierten en permisos individuales.
                                </div>
                                <div className="saas-admin-permission-groups">
                                    {permissionGroups.length === 0 ? (
                                        <div className="saas-admin-empty-inline">El rol actual no tiene permisos opcionales habilitados.</div>
                                    ) : null}
                                    {permissionGroups.map((group) => {
                                        const activeCount = group.permissions.filter((permissionKey) => (
                                            basePermissionSet.has(permissionKey)
                                            || (optionalPermissionSet.has(permissionKey) && !blockedPermissionSet.has(permissionKey) && directGrantSet.has(permissionKey))
                                            || packedPermissionSet.has(permissionKey)
                                        )).length;
                                        const defaultOpen = activeCount > 0 || group.id === 'customers' || group.id === 'labels-zones';
                                        return (
                                            <details key={`permission_group_${group.id}`} className="saas-admin-permission-group" open={defaultOpen}>
                                                <summary>
                                                    <span>{group.title}</span>
                                                    <small>{activeCount}/{group.permissions.length} activos</small>
                                                </summary>
                                                <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                                    <button
                                                        type="button"
                                                        disabled={busy || loadingAccessCatalog}
                                                        onClick={() => setUserForm?.((prev) => {
                                                            const nextSet = buildSet(prev.permissionGrants);
                                                            group.permissions.forEach((permissionKey) => {
                                                                if (optionalPermissionSet.has(permissionKey) && !basePermissionSet.has(permissionKey) && !blockedPermissionSet.has(permissionKey)) nextSet.add(permissionKey);
                                                            });
                                                            return { ...prev, permissionGrants: Array.from(nextSet) };
                                                        })}
                                                    >
                                                        Activar grupo
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="saas-btn-cancel"
                                                        disabled={busy || loadingAccessCatalog}
                                                        onClick={() => setUserForm?.((prev) => {
                                                            const nextSet = buildSet(prev.permissionGrants);
                                                            group.permissions.forEach((permissionKey) => nextSet.delete(permissionKey));
                                                            return { ...prev, permissionGrants: Array.from(nextSet) };
                                                        })}
                                                    >
                                                        Limpiar adicionales
                                                    </button>
                                                </div>
                                                <div className="saas-admin-permission-list">
                                                    {group.permissions.map((permissionKey) => {
                                                        const includedInRole = basePermissionSet.has(permissionKey);
                                                        const blockedByRole = blockedPermissionSet.has(permissionKey);
                                                        const ignoredGrant = !includedInRole && directGrantSet.has(permissionKey) && ignoredGrantSet.has(permissionKey);
                                                        const fromPack = !includedInRole && packedPermissionSet.has(permissionKey) && effectivePermissionSet.has(permissionKey);
                                                        const appliedGrant = !includedInRole && directGrantSet.has(permissionKey) && optionalPermissionSet.has(permissionKey) && !blockedByRole;
                                                        const checked = includedInRole || fromPack || appliedGrant;
                                                        const canToggle = optionalPermissionSet.has(permissionKey) && !includedInRole && !blockedByRole && !ignoredGrant;
                                                        const permissionLabel = permissionLabelMap.get(permissionKey) || permissionKey;
                                                        const description = PERMISSION_DESCRIPTIONS[permissionKey] || 'Permiso granular del tenant.';
                                                        const sensitiveSeller = selectedRole === 'seller' && checked && SENSITIVE_SELLER_PERMISSIONS.has(permissionKey);
                                                        const statusClass = blockedByRole ? ' is-blocked' : (ignoredGrant ? ' is-ignored' : '');
                                                        const statusLabel = includedInRole
                                                            ? `Incluido en el rol ${selectedRoleLabel}`
                                                            : (blockedByRole
                                                                ? `Bloqueado por el rol ${selectedRoleLabel}`
                                                                : (ignoredGrant
                                                                    ? `Bloqueado o no permitido por el rol ${selectedRoleLabel}. Edita el rol primero.`
                                                                    : (checked ? 'Permiso adicional efectivo' : 'Disponible para asignar')));
                                                        return (
                                                            <label key={`assignment_permission_${permissionKey}`} className={`saas-admin-permission-toggle${checked ? ' is-active' : ''}${!canToggle ? ' is-locked' : ''}${statusClass}`.trim()} title={statusLabel}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={checked}
                                                                    disabled={busy || loadingAccessCatalog || !canToggle}
                                                                    onChange={(event) => togglePermissionGrant(permissionKey, event.target.checked)}
                                                                />
                                                                <span className="saas-admin-permission-switch" aria-hidden="true" />
                                                                <span className="saas-admin-permission-body">
                                                                    <span className="saas-admin-permission-title-row">
                                                                        <strong>{permissionLabel}</strong>
                                                                        {includedInRole ? <em className="is-role-included">incluido en {selectedRoleLabel}</em> : null}
                                                                        {blockedByRole ? <em className="is-blocked">bloqueado por {selectedRoleLabel}</em> : null}
                                                                        {ignoredGrant ? <em className="is-warning">adicional ignorado</em> : null}
                                                                        {fromPack ? <em className="is-additional">adicional de paquete anterior</em> : null}
                                                                        {!includedInRole && !fromPack && checked ? <em className="is-additional">permiso adicional efectivo</em> : null}
                                                                        {sensitiveSeller ? <em className="is-warning">Permiso avanzado</em> : null}
                                                                    </span>
                                                                    <small>{description}</small>
                                                                    {ignoredGrant || blockedByRole ? <small className="saas-admin-permission-note">{statusLabel}</small> : null}
                                                                    <code>{permissionKey}</code>
                                                                </span>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            </details>
                                        );
                                    })}
                                </div>
                                <div className="saas-admin-permission-audit-summary">
                                    <strong>Este usuario tiene {effectivePermissionList.length} permisos efectivos activos.</strong>
                                    {permissionsAuditLoading ? <span>Auditando permisos...</span> : null}
                                    {permissionsAuditError ? <span className="is-warning">{permissionsAuditError}</span> : null}
                                    {effectivePermissionList.length > 0 ? (
                                        <button type="button" onClick={() => setShowEffectivePermissions(true)}>
                                            Ver lista completa
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : null}
                {showEffectivePermissions ? (
                    <div className="saas-template-builder-modal-overlay" onClick={() => setShowEffectivePermissions(false)}>
                        <div className="saas-template-builder-modal-shell" onClick={(event) => event.stopPropagation()}>
                            <div className="saas-template-builder-modal-panel">
                                <div className="saas-detail-panel__header">
                                    <div>
                                        <h3>Permisos efectivos</h3>
                                        <p>{effectivePermissionList.length} permisos activos reales para este usuario.</p>
                                    </div>
                                    <button type="button" onClick={() => setShowEffectivePermissions(false)}>Cerrar</button>
                                </div>
                                <div className="saas-template-builder-modal-panel__body">
                                    <div className="saas-admin-permission-effective-list">
                                        {effectivePermissionList.map((permissionKey) => (
                                            <div key={`effective_permission_${permissionKey}`} className="saas-admin-detail-field">
                                                <span>{permissionLabelMap.get(permissionKey) || permissionKey}</span>
                                                <strong>{permissionKey}</strong>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : null}
                <div className="saas-admin-form-row saas-admin-form-row--actions">
                    <button
                        type="button"
                        disabled={busy || !text(userForm.email) || !text(userForm.tenantId) || (userPanelMode === 'create' && !userForm.password)}
                        onClick={saveUser}
                    >
                        {userPanelMode === 'create' ? 'Guardar usuario' : 'Actualizar usuario'}
                    </button>
                    <button type="button" className="saas-btn-cancel" disabled={busy} onClick={() => { void requestClose?.(); }}>Cancelar</button>
                </div>
            </>
        );
    }, [
        accessPackOptions,
        activeTenantId,
        allowedOptionalPermissionsForUserFormRole,
        allowedPackIdsForUserFormRole,
        busy,
        canConfigureOptionalAccessInUserForm,
        canEditRoleInUserForm,
        canEditScopeInUserForm,
        canEditSelectedUser,
        canManageUsers,
        canToggleSelectedUserStatus,
        getAllowedPackIdsForRole,
        getOptionalPermissionKeysForRole,
        handleFormImageUpload,
        hasAccessCatalogData,
        loadingAccessCatalog,
        permissionLabelMap,
        permissionsAudit,
        permissionsAuditError,
        permissionsAuditLoading,
        roleLabelMap,
        roleOptions,
        roleProfiles,
        saveUser,
        selectedTenantId,
        selectedUser,
        setUserForm,
        showEffectivePermissions,
        settingsTenantId,
        tenantOptions,
        toTenantDisplayName,
        userForm,
        userPanelMode
    ]);

    if (selectedSectionId !== 'saas_usuarios') return null;

    return (
        <div className="saas-admin-grid">
            <SaasEntityPage
                id="saas_usuarios"
                sectionKey="saas_usuarios"
                title="Usuarios"
                rows={rows}
                columns={columns}
                selectedId={selectedEntityId}
                onSelect={(row) => openUserView?.(row?.id)}
                onClose={close}
                renderDetail={renderDetail}
                renderForm={renderForm}
                mode={isEditing ? 'form' : 'detail'}
                dirty={isEditing}
                className="saas-entity-page--users"
                requestJson={requestJson}
                loading={busy && rows.length === 0}
                emptyText={tenantScopeLocked ? 'Selecciona una empresa para habilitar usuarios.' : 'No hay usuarios registrados.'}
                searchPlaceholder="Buscar usuario por nombre, correo, rol o estado..."
                filters={filters}
                actions={[
                    { label: 'Recargar', onClick: () => refreshOverview?.(), disabled: busy || typeof refreshOverview !== 'function' },
                    canManageUsers
                        ? { label: 'Agregar', onClick: openUserCreate, disabled: busy || tenantScopeLocked }
                        : null
                ].filter(Boolean)}
                detailTitle={userPanelMode === 'create'
                    ? 'Nuevo usuario'
                    : userPanelMode === 'edit'
                        ? `Editando: ${toUserDisplayName(selectedUser || {})}`
                        : toUserDisplayName(selectedUser || {})}
                detailSubtitle={userPanelMode === 'view'
                    ? 'Campos bloqueados. Usa Editar para modificar.'
                    : 'ID y correo bloqueados durante edición para mantener consistencia.'}
                detailActions={detailActions}
            />
        </div>
    );
}

export default React.memo(UsersSection);
