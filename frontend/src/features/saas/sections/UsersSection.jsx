import React from 'react';
import ImageDropInput from '../components/panel/ImageDropInput';
import { SaasEntityPage } from '../components/layout';

function text(value) {
    return String(value ?? '').trim();
}

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
        userPanelMode,
        openUserView,
        selectedUser,
        canEditSelectedUser,
        canToggleSelectedUserStatus,
        toUserDisplayName = (user) => user?.name || user?.email || user?.id || '-',
        openUserEdit,
        runAction,
        requestJson,
        canEditScopeInUserForm,
        settingsTenantId,
        openTenantFromUserMembership,
        toTenantDisplayName = (tenant) => tenant?.name || tenant?.id || '-',
        formatDateTimeLabel = (value) => value || '-',
        userForm = {},
        setUserForm,
        roleOptions = [],
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
                payload.permissionPacks = Array.isArray(userForm.permissionPacks)
                    ? userForm.permissionPacks.map((entry) => text(entry)).filter(Boolean)
                    : [];
                payload.permissionGrants = Array.isArray(userForm.permissionGrants)
                    ? userForm.permissionGrants.map((entry) => text(entry)).filter(Boolean)
                    : [];
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
            setUserPanelMode?.('view');
        }
    ), [
        canConfigureOptionalAccessInUserForm,
        canEditOptionalAccess,
        canEditScopeInUserForm,
        requestJson,
        runAction,
        sanitizeMemberships,
        selectedUser,
        setSelectedUserId,
        setUserPanelMode,
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
                    <div className="saas-admin-detail-field"><span>Packs de acceso</span><strong>{Array.isArray(selectedUser.permissionPacks) ? selectedUser.permissionPacks.length : 0}</strong></div>
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

                <div className="saas-admin-related-block">
                    <h4>Accesos opcionales</h4>
                    <div className="saas-admin-related-list">
                        {(Array.isArray(selectedUser.permissionPacks) ? selectedUser.permissionPacks : []).length === 0 ? (
                            <div className="saas-admin-empty-inline">Sin paquetes opcionales asignados.</div>
                        ) : null}
                        {(Array.isArray(selectedUser.permissionPacks) ? selectedUser.permissionPacks : []).map((entry, index) => (
                            <div key={`${selectedUser.id}_pack_${index}`} className="saas-admin-related-row" role="status">
                                <span>{accessPackLabelMap.get(text(entry)) || entry}</span>
                                <small>{entry}</small>
                            </div>
                        ))}
                    </div>
                </div>
            </>
        );
    }, [
        accessPackLabelMap,
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
                        <div className="saas-admin-optional-access-grid">
                            <div className="saas-admin-optional-access-column">
                                <small className="saas-admin-optional-access-title">Paquetes</small>
                                <div className="saas-admin-modules">
                                    {accessPackOptions.length === 0 ? (
                                        <div className="saas-admin-empty-inline">Sin paquetes configurados.</div>
                                    ) : null}
                                    {accessPackOptions.map((pack) => {
                                        const optionPackId = text(pack?.id);
                                        if (!optionPackId) return null;
                                        const checked = Array.isArray(userForm.permissionPacks) && userForm.permissionPacks.includes(optionPackId);
                                        const packAllowed = allowedPackIdsForUserFormRole.has(optionPackId);
                                        return (
                                            <label key={`assignment_pack_${optionPackId}`} className="saas-admin-module-toggle">
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    disabled={busy || loadingAccessCatalog || !packAllowed}
                                                    onChange={(event) => setUserForm?.((prev) => {
                                                        const current = Array.isArray(prev.permissionPacks) ? prev.permissionPacks : [];
                                                        const nextSet = new Set(current.map((entry) => text(entry)).filter(Boolean));
                                                        if (event.target.checked) nextSet.add(optionPackId);
                                                        else nextSet.delete(optionPackId);
                                                        return { ...prev, permissionPacks: Array.from(nextSet) };
                                                    })}
                                                />
                                                <span>{text(pack?.label || optionPackId)}{packAllowed ? '' : ' (no aplica al rol)'}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="saas-admin-optional-access-column">
                                <small className="saas-admin-optional-access-title">Permisos directos por rol</small>
                                <div className="saas-admin-modules">
                                    {allowedOptionalPermissionsForUserFormRole.length === 0 ? (
                                        <div className="saas-admin-empty-inline">El rol actual no tiene permisos opcionales habilitados.</div>
                                    ) : null}
                                    {allowedOptionalPermissionsForUserFormRole.map((permissionKey) => {
                                        const checked = Array.isArray(userForm.permissionGrants) && userForm.permissionGrants.includes(permissionKey);
                                        const permissionLabel = permissionLabelMap.get(permissionKey) || permissionKey;
                                        return (
                                            <label key={`assignment_permission_${permissionKey}`} className="saas-admin-module-toggle">
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    disabled={busy || loadingAccessCatalog}
                                                    onChange={(event) => setUserForm?.((prev) => {
                                                        const current = Array.isArray(prev.permissionGrants) ? prev.permissionGrants : [];
                                                        const nextSet = new Set(current.map((entry) => text(entry)).filter(Boolean));
                                                        if (event.target.checked) nextSet.add(permissionKey);
                                                        else nextSet.delete(permissionKey);
                                                        return { ...prev, permissionGrants: Array.from(nextSet) };
                                                    })}
                                                />
                                                <span>{permissionLabel}</span>
                                            </label>
                                        );
                                    })}
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
        roleLabelMap,
        roleOptions,
        saveUser,
        selectedTenantId,
        setUserForm,
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
