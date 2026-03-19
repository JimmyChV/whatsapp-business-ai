import React from 'react';

function RoleProfilesSection({
    isRolesSection,
    busy,
    canManageRoles,
    openRoleCreate,
    roleProfiles,
    selectedRoleKey,
    rolePanelMode,
    openRoleView,
    selectedRoleProfile,
    openRoleEdit,
    permissionLabelMap,
    rolePermissionOptions,
    roleForm,
    setRoleForm,
    sanitizeRoleCode,
    toggleRolePermission,
    saveRoleProfile,
    cancelRoleEdit
}) {
    if (!isRolesSection) {
        return null;
    }

    return (
                    <section id="saas_roles" className="saas-admin-card saas-admin-card--full">
                        <div className="saas-admin-master-detail">
                            <aside className="saas-admin-master-pane">
                                <div className="saas-admin-pane-header">
                                    <div>
                                        <h3>Roles y accesos</h3>
                                        <small>Catalogo global de perfiles de acceso.</small>
                                    </div>
                                    {canManageRoles && (
                                        <button type="button" disabled={busy} onClick={openRoleCreate}>Nuevo rol</button>
                                    )}
                                </div>

                                <div className="saas-admin-list saas-admin-list--compact">
                                    {roleProfiles.length === 0 && (
                                        <div className="saas-admin-empty-state">
                                            <p>No hay perfiles de rol cargados.</p>
                                        </div>
                                    )}
                                    {roleProfiles.map((profile) => {
                                        const cleanRole = String(profile?.role || '').trim().toLowerCase();
                                        const roleLabel = String(profile?.label || cleanRole).trim() || cleanRole;
                                        const requiredCount = Array.isArray(profile?.required) ? profile.required.length : 0;
                                        const optionalCount = Array.isArray(profile?.optional) ? profile.optional.length : 0;
                                        return (
                                            <button
                                                key={`role_profile_${cleanRole}`}
                                                type="button"
                                                className={`saas-admin-list-item saas-admin-list-item--button ${selectedRoleKey === cleanRole && rolePanelMode !== 'create' ? 'active' : ''}`.trim()}
                                                onClick={() => openRoleView(cleanRole)}
                                            >
                                                <strong>{roleLabel}</strong>
                                                <small>{cleanRole}</small>
                                                <small>Req: {requiredCount} | Opc: {optionalCount}</small>
                                            </button>
                                        );
                                    })}
                                </div>
                            </aside>

                            <div className="saas-admin-detail-pane">
                                {!selectedRoleProfile && rolePanelMode !== 'create' && (
                                    <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                        <h4>Selecciona un rol</h4>
                                        <p>Podras revisar su detalle y, como superadmin, ajustar permisos requeridos, opcionales o bloqueados.</p>
                                    </div>
                                )}

                                {selectedRoleProfile && rolePanelMode === 'view' && (
                                    <>
                                        <div className="saas-admin-pane-header">
                                            <div>
                                                <h3>{selectedRoleProfile.label || selectedRoleProfile.role}</h3>
                                                <small>Codigo: {selectedRoleProfile.role}</small>
                                            </div>
                                            {canManageRoles && (
                                                <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                                    <button type="button" disabled={busy} onClick={openRoleEdit}>Editar rol</button>
                                                </div>
                                            )}
                                        </div>

                                        <div className="saas-admin-detail-grid">
                                            <div className="saas-admin-detail-field"><span>Codigo</span><strong>{selectedRoleProfile.role}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Etiqueta</span><strong>{selectedRoleProfile.label || selectedRoleProfile.role}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Permisos obligatorios</span><strong>{Array.isArray(selectedRoleProfile.required) ? selectedRoleProfile.required.length : 0}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Permisos opcionales</span><strong>{Array.isArray(selectedRoleProfile.optional) ? selectedRoleProfile.optional.length : 0}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Permisos bloqueados</span><strong>{Array.isArray(selectedRoleProfile.blocked) ? selectedRoleProfile.blocked.length : 0}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Estado</span><strong>{selectedRoleProfile.active === false ? 'Inactivo' : 'Activo'}</strong></div>
                                        </div>

                                        <div className="saas-admin-related-block">
                                            <h4>Obligatorios</h4>
                                            <div className="saas-admin-related-list">
                                                {(Array.isArray(selectedRoleProfile.required) ? selectedRoleProfile.required : []).length === 0 && (
                                                    <div className="saas-admin-related-row" role="status"><span>Sin permisos obligatorios.</span></div>
                                                )}
                                                {(Array.isArray(selectedRoleProfile.required) ? selectedRoleProfile.required : []).map((permissionKey) => (
                                                    <div key={`role_required_${permissionKey}`} className="saas-admin-related-row" role="status">
                                                        <span>{permissionLabelMap.get(permissionKey) || permissionKey}</span>
                                                        <small>{permissionKey}</small>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="saas-admin-related-block">
                                            <h4>Opcionales</h4>
                                            <div className="saas-admin-related-list">
                                                {(Array.isArray(selectedRoleProfile.optional) ? selectedRoleProfile.optional : []).length === 0 && (
                                                    <div className="saas-admin-related-row" role="status"><span>Sin permisos opcionales.</span></div>
                                                )}
                                                {(Array.isArray(selectedRoleProfile.optional) ? selectedRoleProfile.optional : []).map((permissionKey) => (
                                                    <div key={`role_optional_${permissionKey}`} className="saas-admin-related-row" role="status">
                                                        <span>{permissionLabelMap.get(permissionKey) || permissionKey}</span>
                                                        <small>{permissionKey}</small>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="saas-admin-related-block">
                                            <h4>Bloqueados</h4>
                                            <div className="saas-admin-related-list">
                                                {(Array.isArray(selectedRoleProfile.blocked) ? selectedRoleProfile.blocked : []).length === 0 && (
                                                    <div className="saas-admin-related-row" role="status"><span>Sin permisos bloqueados.</span></div>
                                                )}
                                                {(Array.isArray(selectedRoleProfile.blocked) ? selectedRoleProfile.blocked : []).map((permissionKey) => (
                                                    <div key={`role_blocked_${permissionKey}`} className="saas-admin-related-row" role="status">
                                                        <span>{permissionLabelMap.get(permissionKey) || permissionKey}</span>
                                                        <small>{permissionKey}</small>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                )}

                                {(rolePanelMode === 'create' || rolePanelMode === 'edit') && (
                                    <>
                                        <div className="saas-admin-pane-header">
                                            <div>
                                                <h3>{rolePanelMode === 'create' ? 'Nuevo rol' : `Editando rol: ${roleForm.role || selectedRoleKey}`}</h3>
                                                <small>Define permisos obligatorios, opcionales y bloqueados por perfil.</small>
                                            </div>
                                        </div>

                                        <div className="saas-admin-form-row">
                                            <input
                                                value={roleForm.role}
                                                onChange={(event) => setRoleForm((prev) => ({ ...prev, role: sanitizeRoleCode(event.target.value) }))}
                                                placeholder="Codigo rol (ej: support_manager)"
                                                disabled={busy || rolePanelMode !== 'create'}
                                            />
                                            <input
                                                value={roleForm.label}
                                                onChange={(event) => setRoleForm((prev) => ({ ...prev, label: event.target.value }))}
                                                placeholder="Etiqueta visible"
                                                disabled={busy}
                                            />
                                        </div>

                                        <div className="saas-admin-modules">
                                            <label className="saas-admin-module-toggle">
                                                <input
                                                    type="checkbox"
                                                    checked={roleForm.active !== false}
                                                    onChange={(event) => setRoleForm((prev) => ({ ...prev, active: event.target.checked }))}
                                                    disabled={busy || (rolePanelMode === 'edit' && selectedRoleProfile?.isSystem === true)}
                                                />
                                                <span>Rol activo</span>
                                            </label>
                                        </div>

                                        <div className="saas-admin-related-block">
                                            <h4>Matriz de permisos</h4>
                                            <div className="saas-admin-related-list">
                                                {rolePermissionOptions.map((permission) => {
                                                    const permissionKey = String(permission?.key || '').trim();
                                                    const isRequired = roleForm.required.includes(permissionKey);
                                                    const isOptional = roleForm.optional.includes(permissionKey);
                                                    const isBlocked = roleForm.blocked.includes(permissionKey);

                                                    return (
                                                        <div key={`role_permission_matrix_${permissionKey}`} className="saas-admin-related-row" role="status">
                                                            <span>{permission.label || permissionKey}</span>
                                                            <div className="saas-admin-inline-checks">
                                                                <label>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isRequired}
                                                                        onChange={(event) => toggleRolePermission('required', permissionKey, event.target.checked)}
                                                                        disabled={busy}
                                                                    />
                                                                    <small>Obligatorio</small>
                                                                </label>
                                                                <label>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isOptional}
                                                                        onChange={(event) => toggleRolePermission('optional', permissionKey, event.target.checked)}
                                                                        disabled={busy}
                                                                    />
                                                                    <small>Opcional</small>
                                                                </label>
                                                                <label>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isBlocked}
                                                                        onChange={(event) => toggleRolePermission('blocked', permissionKey, event.target.checked)}
                                                                        disabled={busy}
                                                                    />
                                                                    <small>Bloqueado</small>
                                                                </label>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="saas-admin-form-row saas-admin-form-row--actions">
                                            <button
                                                type="button"
                                                disabled={busy || !String(roleForm.role || selectedRoleKey || '').trim()}
                                                onClick={saveRoleProfile}
                                            >
                                                {rolePanelMode === 'create' ? 'Crear rol' : 'Guardar cambios'}
                                            </button>
                                            <button type="button" disabled={busy} onClick={cancelRoleEdit}>Cancelar</button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </section>
    );
}

export default React.memo(RoleProfilesSection);
