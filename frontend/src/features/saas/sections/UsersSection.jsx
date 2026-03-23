import React from 'react';
import ImageDropInput from '../components/panel/ImageDropInput';

function UsersSection(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const {
    selectedSectionId,
    tenantScopeLocked,
    busy,
    canManageUsers,
    openUserCreate,
    selectedTenantId,
    tenantOptions,
    hasAccessCatalogData,
    loadingAccessCatalog,
    scopedUsers,
    selectedUserId,
    userPanelMode,
    openUserView,
    selectedUser,
    canEditSelectedUser,
    canToggleSelectedUserStatus,
    toUserDisplayName,
    openUserEdit,
    runAction,
    requestJson,
    canEditScopeInUserForm,
    settingsTenantId,
    openTenantFromUserMembership,
    toTenantDisplayName,
    formatDateTimeLabel,
    userForm,
    setUserForm,
    roleOptions,
    canEditRoleInUserForm,
    canEditOptionalAccess,
    allowedOptionalPermissionsForUserFormRole,
    permissionLabelMap,
    getOptionalPermissionKeysForRole,
    accessPackOptions,
    accessPackLabelMap,
    getAllowedPackIdsForRole,
    allowedPackIdsForUserFormRole,
    canConfigureOptionalAccessInUserForm,
    roleLabelMap,
    sanitizeMemberships,
    setSelectedUserId,
    setUserPanelMode,
    cancelUserEdit,
    handleFormImageUpload,
    buildInitials,
    activeTenantId,
    packId = ''
    } = context;
    if (selectedSectionId !== 'saas_usuarios') {
        return null;
    }

    return (
                    <section id="saas_usuarios" className="saas-admin-card saas-admin-card--full">
                        <div className="saas-admin-master-detail">
                            <aside className="saas-admin-master-pane">
                                <div className="saas-admin-pane-header">
                                    <div>
                                        <h3>Usuarios ({scopedUsers.length})</h3>
                                        <small>Listado minimo. El detalle se administra en el panel derecho.</small>
                                    </div>
                                    {canManageUsers && (
                                        <button type="button" disabled={busy || tenantScopeLocked} onClick={openUserCreate}>Agregar usuario</button>
                                    )}
                                </div>
                                <div className="saas-admin-list saas-admin-list--compact">
                                    {scopedUsers.length === 0 && (
                                        <div className="saas-admin-empty-state">
                                            <p>{tenantScopeLocked ? 'Selecciona una empresa para habilitar usuarios.' : 'No hay usuarios registrados.'}</p>
                                            {canManageUsers && (
                                                <button type="button" disabled={busy || tenantScopeLocked} onClick={openUserCreate}>Crear primer usuario</button>
                                            )}
                                        </div>
                                    )}
                                    {scopedUsers.map((user) => {
                                        const userMemberships = sanitizeMemberships(user?.memberships || []);
                                        return (
                                            <button
                                                key={user.id}
                                                type="button"
                                                className={`saas-admin-list-item saas-admin-list-item--button ${selectedUserId === user.id && userPanelMode !== 'create' ? 'active' : ''}`.trim()}
                                                onClick={() => openUserView(user.id)}
                                            >
                                                <strong>{toUserDisplayName(user)}</strong>
                                                <small>{user.email || '-'} | {user.active === false ? 'inactivo' : 'activo'}</small>
                                                <small>Membresias: {userMemberships.length}</small>
                                            </button>
                                        );
                                    })}
                                </div>
                            </aside>

                            <div className="saas-admin-detail-pane">
                                {!selectedUser && userPanelMode !== 'create' && (
                                    <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                        <h4>Selecciona un usuario</h4>
                                        <p>El detalle se mostrara bloqueado aqui. Editar se activa solo por boton.</p>
                                    </div>
                                )}

                                {(selectedUser || userPanelMode === 'create') && (
                                    <>
                                        <div className="saas-admin-pane-header">
                                            <div>
                                                <h3>
                                                    {userPanelMode === 'create'
                                                        ? 'Nuevo usuario'
                                                        : userPanelMode === 'edit'
                                                            ? `Editando: ${toUserDisplayName(selectedUser || {})}`
                                                            : toUserDisplayName(selectedUser || {})}
                                                </h3>
                                                <small>
                                                    {userPanelMode === 'view'
                                                        ? 'Campos bloqueados. Usa Editar para modificar.'
                                                        : 'ID y correo bloqueados durante edicion para mantener consistencia.'}
                                                </small>
                                            </div>
                                            {userPanelMode === 'view' && selectedUser && !canEditSelectedUser && (
                                                <div className="saas-admin-empty-inline">
                                                    No puedes editar este usuario porque tiene el mismo nivel o uno superior al tuyo.
                                                </div>
                                            )}
                                            {userPanelMode === 'view' && selectedUser && canManageUsers && (
                                                <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                                    <button type="button" disabled={busy || !canEditSelectedUser} onClick={openUserEdit}>Editar</button>
                                                    <button
                                                        type="button"
                                                        disabled={busy || !canToggleSelectedUserStatus}
                                                        onClick={() => runAction('Estado de usuario actualizado', async () => {
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
                                                </div>
                                            )}
                                        </div>

                                        {userPanelMode === 'view' && selectedUser && (
                                            <>
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
                                                    <div className="saas-admin-detail-field"><span>Codigo</span><strong>{selectedUser?.id || '-'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Correo</span><strong>{selectedUser.email || '-'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Rol</span><strong>{selectedUser.roleLabel || selectedUser.role || '-'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Estado</span><strong>{selectedUser.active === false ? 'Inactivo' : 'Activo'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Packs de acceso</span><strong>{Array.isArray(selectedUser.permissionPacks) ? selectedUser.permissionPacks.length : 0}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Actualizado</span><strong>{formatDateTimeLabel(selectedUser.updatedAt)}</strong></div>
                                                </div>

                                                <div className="saas-admin-related-block">
                                                    <h4>Empresas vinculadas</h4>
                                                    <div className="saas-admin-related-list">
                                                        {sanitizeMemberships(selectedUser.memberships || []).length === 0 && (
                                                            <div className="saas-admin-empty-inline">Sin membresias activas.</div>
                                                        )}
                                                        {sanitizeMemberships(selectedUser.memberships || []).map((membership, index) => {
                                                            const tenantLabel = toTenantDisplayName(tenantOptions.find((tenant) => tenant.id === membership.tenantId) || {});
                                                            return (
                                                                <button
                                                                    key={`${selectedUser.id}_membership_view_${index}`}
                                                                    type="button"
                                                                    className="saas-admin-related-row"
                                                                    onClick={() => openTenantFromUserMembership(membership.tenantId)}
                                                                >
                                                                    <span>{tenantLabel}</span>
                                                                    <small>{membership.role}{membership.active ? '' : ' (inactivo)'}</small>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                <div className="saas-admin-related-block">
                                                    <h4>Accesos opcionales</h4>
                                                    <div className="saas-admin-related-list">
                                                        {(Array.isArray(selectedUser.permissionPacks) ? selectedUser.permissionPacks : []).length === 0 && (
                                                            <div className="saas-admin-empty-inline">Sin paquetes opcionales asignados.</div>
                                                        )}
                                                        {(Array.isArray(selectedUser.permissionPacks) ? selectedUser.permissionPacks : []).map((packId, index) => (
                                                            <div key={`${selectedUser.id}_pack_${index}`} className="saas-admin-related-row" role="status">
                                                                <span>{accessPackLabelMap.get(String(packId || '').trim()) || packId}</span>
                                                                <small>{packId}</small>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                </>
                                        )}

                                        {userPanelMode !== 'view' && canManageUsers && (userPanelMode === 'create' || canEditSelectedUser) && (
                                            <>
                                                <div className="saas-admin-form-row">
                                                    <input
                                                        value={userForm.email}
                                                        onChange={(event) => setUserForm((prev) => ({ ...prev, email: event.target.value }))}
                                                        placeholder="email"
                                                        disabled={userPanelMode !== 'create' || busy}
                                                    />
                                                </div>
                                                <div className="saas-admin-form-row">
                                                    <input
                                                        value={userForm.name}
                                                        onChange={(event) => setUserForm((prev) => ({ ...prev, name: event.target.value }))}
                                                        placeholder="Nombre"
                                                        disabled={busy}
                                                    />
                                                    <input
                                                        value={userForm.password}
                                                        onChange={(event) => setUserForm((prev) => ({ ...prev, password: event.target.value }))}
                                                        type="password"
                                                        placeholder={userPanelMode === 'create' ? 'password inicial' : 'nueva password (opcional)'}
                                                        disabled={busy}
                                                    />
                                                </div>
                                                <div className="saas-admin-form-row">
                                                    <label className="saas-admin-module-toggle">
                                                        <input
                                                            type="checkbox"
                                                            checked={userForm.active !== false}
                                                            onChange={(event) => setUserForm((prev) => ({ ...prev, active: event.target.checked }))}
                                                            disabled={busy || (userPanelMode === 'edit' && !canToggleSelectedUserStatus)}
                                                        />
                                                        <span>Usuario activo</span>
                                                    </label>
                                                </div>
                                                <div className="saas-admin-form-row">
                                                    <ImageDropInput
                                                        label="Reemplazar avatar"
                                                        disabled={busy}
                                                        onFile={(file) => handleFormImageUpload({
                                                            file,
                                                            scope: 'user_avatar',
                                                            tenantId: userForm.tenantId || settingsTenantId || selectedTenantId || activeTenantId || 'default',
                                                            onUploaded: (url) => setUserForm((prev) => ({ ...prev, avatarUrl: url }))
                                                        })}
                                                    />
                                                </div>

                                                {userForm.avatarUrl && (
                                                    <div className="saas-admin-preview-strip">
                                                        <img src={userForm.avatarUrl} alt="Avatar usuario" className="saas-admin-preview-thumb" />
                                                    </div>
                                                )}

                                                {userPanelMode !== 'view' && (
                                                    <div className="saas-admin-form-row">
                                                        <select value={userForm.tenantId} onChange={(event) => setUserForm((prev) => ({ ...prev, tenantId: event.target.value }))} disabled={busy || !canEditScopeInUserForm}>
                                                            <option value="">Tenant inicial</option>
                                                            {tenantOptions.map((tenant) => (
                                                                <option key={tenant.id} value={tenant.id}>{toTenantDisplayName(tenant)}</option>
                                                            ))}
                                                        </select>
                                                        <select value={userForm.role} onChange={(event) => {
                                                            const nextRole = event.target.value;
                                                            setUserForm((prev) => {
                                                                const allowedPacks = getAllowedPackIdsForRole(nextRole);
                                                                const allowedPermissions = getOptionalPermissionKeysForRole(nextRole);
                                                                const nextPacks = (Array.isArray(prev.permissionPacks) ? prev.permissionPacks : [])
                                                                    .filter((packId) => allowedPacks.has(String(packId || '').trim()));
                                                                const nextGrants = (Array.isArray(prev.permissionGrants) ? prev.permissionGrants : [])
                                                                    .map((entry) => String(entry || '').trim())
                                                                    .filter((permission) => allowedPermissions.has(permission));
                                                                return {
                                                                    ...prev,
                                                                    role: nextRole,
                                                                    permissionPacks: nextPacks,
                                                                    permissionGrants: Array.from(new Set(nextGrants))
                                                                };
                                                            });
                                                        }} disabled={busy || !canEditRoleInUserForm}>
                                                            {roleOptions.map((role) => (
                                                                <option key={role} value={role}>{roleLabelMap.get(String(role || '').trim().toLowerCase()) || role}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                )}
                                                {canConfigureOptionalAccessInUserForm && (
                                                    <div className="saas-admin-related-block">
                                                        <h4>Accesos opcionales</h4>
                                                        {loadingAccessCatalog && (
                                                            <div className="saas-admin-empty-inline">Cargando catalogo de accesos...</div>
                                                        )}
                                                        {!loadingAccessCatalog && !hasAccessCatalogData && (
                                                            <div className="saas-admin-empty-inline">No se pudo cargar el catalogo de accesos. Reabre el editor de usuario para reintentar.</div>
                                                        )}
                                                        <div className="saas-admin-optional-access-grid">
                                                            <div className="saas-admin-optional-access-column">
                                                                <small className="saas-admin-optional-access-title">Paquetes</small>
                                                                <div className="saas-admin-modules">
                                                                    {accessPackOptions.length === 0 && (
                                                                        <div className="saas-admin-empty-inline">Sin paquetes configurados. Puedes trabajar con permisos directos.</div>
                                                                    )}
                                                                    {accessPackOptions.map((pack) => {
                                                                        const packId = String(pack?.id || '').trim();
                                                                        if (!packId) return null;
                                                                        const packAllowed = allowedPackIdsForUserFormRole.has(packId);
                                                                        const checked = Array.isArray(userForm.permissionPacks) && userForm.permissionPacks.includes(packId);
                                                                        return (
                                                                            <label key={`assignment_pack_${packId}`} className="saas-admin-module-toggle">
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={checked}
                                                                                    disabled={busy || loadingAccessCatalog || !packAllowed}
                                                                                    onChange={(event) => setUserForm((prev) => {
                                                                                        const current = Array.isArray(prev.permissionPacks) ? prev.permissionPacks : [];
                                                                                        const nextSet = new Set(current.map((entry) => String(entry || '').trim()).filter(Boolean));
                                                                                        if (event.target.checked) {
                                                                                            nextSet.add(packId);
                                                                                        } else {
                                                                                            nextSet.delete(packId);
                                                                                        }
                                                                                        return { ...prev, permissionPacks: Array.from(nextSet) };
                                                                                    })}
                                                                                />
                                                                                <span>{String(pack?.label || packId)}{packAllowed ? '' : ' (no aplica al rol)'}</span>
                                                                            </label>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                            <div className="saas-admin-optional-access-column">
                                                                <small className="saas-admin-optional-access-title">Permisos directos por rol</small>
                                                                <div className="saas-admin-modules">
                                                                    {allowedOptionalPermissionsForUserFormRole.length === 0 && (
                                                                        <div className="saas-admin-empty-inline">El rol actual no tiene permisos opcionales habilitados.</div>
                                                                    )}
                                                                    {allowedOptionalPermissionsForUserFormRole.map((permissionKey) => {
                                                                        const checked = Array.isArray(userForm.permissionGrants) && userForm.permissionGrants.includes(permissionKey);
                                                                        const permissionLabel = permissionLabelMap.get(permissionKey) || permissionKey;
                                                                        return (
                                                                            <label key={`assignment_pack_${packId}`} className="saas-admin-module-toggle">
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={checked}
                                                                                    disabled={busy || loadingAccessCatalog}
                                                                                    onChange={(event) => setUserForm((prev) => {
                                                                                        const current = Array.isArray(prev.permissionGrants) ? prev.permissionGrants : [];
                                                                                        const nextSet = new Set(current.map((entry) => String(entry || '').trim()).filter(Boolean));
                                                                                        if (event.target.checked) {
                                                                                            nextSet.add(permissionKey);
                                                                                        } else {
                                                                                            nextSet.delete(permissionKey);
                                                                                        }
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
                                                )}
                                                <div className="saas-admin-form-row saas-admin-form-row--actions">
                                                    <button
                                                        type="button"
                                                        disabled={
                                                            busy
                                                            || !userForm.email.trim()
                                                            || !userForm.tenantId.trim()
                                                            || (userPanelMode === 'create' && !userForm.password)
                                                        }
                                                        onClick={() => runAction(userPanelMode === 'create' ? 'Usuario creado' : 'Usuario actualizado', async () => {
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

                                                            if (isCreateMode || canEditScopeInUserForm) {
                                                                payload.memberships = membershipsPayload;
                                                            }

                                                            if ((isCreateMode && canEditOptionalAccess) || (!isCreateMode && canConfigureOptionalAccessInUserForm)) {
                                                                payload.permissionPacks = Array.isArray(userForm.permissionPacks)
                                                                    ? userForm.permissionPacks.map((entry) => String(entry || '').trim()).filter(Boolean)
                                                                    : [];
                                                                payload.permissionGrants = Array.isArray(userForm.permissionGrants)
                                                                    ? userForm.permissionGrants.map((entry) => String(entry || '').trim()).filter(Boolean)
                                                                    : [];
                                                            }

                                                            if (userForm.password) {
                                                                payload.password = userForm.password;
                                                            }

                                                            if (userPanelMode === 'create' || !selectedUser?.id) {
                                                                const createdPayload = await requestJson('/api/admin/saas/users', {
                                                                    method: 'POST',
                                                                    body: payload
                                                                });
                                                                const createdId = String(createdPayload?.user?.id || '').trim();
                                                                if (createdId) {
                                                                    setSelectedUserId(createdId);
                                                                }
                                                                setUserPanelMode('view');
                                                                return;
                                                            }

                                                            await requestJson(`/api/admin/saas/users/${encodeURIComponent(selectedUser.id)}`, {
                                                                method: 'PUT',
                                                                body: payload
                                                            });
                                                            setUserPanelMode('view');
                                                        })}
                                                    >
                                                        {userPanelMode === 'create' ? 'Guardar usuario' : 'Actualizar usuario'}
                                                    </button>
                                                    <button type="button" disabled={busy} onClick={cancelUserEdit}>Cancelar</button>
                                                </div>
                                            </>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </section>
    );
}

export default React.memo(UsersSection);

