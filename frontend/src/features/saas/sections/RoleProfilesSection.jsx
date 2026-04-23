import React from 'react';
import { SaasEntityPage } from '../components/layout';

function PermissionList({ title, permissions = [], permissionLabelMap }) {
    const items = Array.isArray(permissions) ? permissions : [];
    return (
        <div className="saas-admin-related-block">
            <h4>{title}</h4>
            <div className="saas-admin-related-list">
                {items.length === 0 ? (
                    <div className="saas-admin-related-row" role="status">
                        <span>Sin permisos.</span>
                    </div>
                ) : null}
                {items.map((permissionKey) => (
                    <div key={`${title}_${permissionKey}`} className="saas-admin-related-row" role="status">
                        <span>{permissionLabelMap?.get(permissionKey) || permissionKey}</span>
                        <small>{permissionKey}</small>
                    </div>
                ))}
            </div>
        </div>
    );
}

function RoleProfilesSection(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const {
        isRolesSection,
        busy,
        canManageRoles,
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

    const isEditing = rolePanelMode === 'create' || rolePanelMode === 'edit';
    const selectedId = rolePanelMode === 'create' ? '__create_role' : selectedRoleProfile?.role || selectedRoleKey || '';

    const rows = React.useMemo(() => roleProfiles.map((profile) => {
        const role = String(profile?.role || '').trim().toLowerCase();
        const label = String(profile?.label || role).trim() || role;
        return {
            id: role,
            role,
            label,
            requiredCount: Array.isArray(profile?.required) ? profile.required.length : 0,
            optionalCount: Array.isArray(profile?.optional) ? profile.optional.length : 0,
            blockedCount: Array.isArray(profile?.blocked) ? profile.blocked.length : 0,
            status: profile?.active === false ? 'Inactivo' : 'Activo',
            raw: profile
        };
    }), [roleProfiles]);

    const columns = React.useMemo(() => [
        { key: 'label', label: 'Rol', width: '24%', minWidth: '220px', sortable: true },
        { key: 'role', label: 'Codigo', width: '20%', minWidth: '180px', sortable: true },
        { key: 'requiredCount', label: 'Requeridos', width: '14%', minWidth: '130px', sortable: true },
        { key: 'optionalCount', label: 'Opcionales', width: '14%', minWidth: '130px', sortable: true },
        { key: 'blockedCount', label: 'Bloqueados', width: '14%', minWidth: '130px', sortable: true },
        { key: 'status', label: 'Estado', width: '14%', minWidth: '120px', sortable: true }
    ], []);

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
                    <p>Podras revisar su detalle y ajustar permisos si tienes acceso de superadmin.</p>
                </div>
            );
        }

        return (
            <>
                <div className="saas-admin-detail-grid">
                    <div className="saas-admin-detail-field"><span>Codigo</span><strong>{selectedRoleProfile.role}</strong></div>
                    <div className="saas-admin-detail-field"><span>Etiqueta</span><strong>{selectedRoleProfile.label || selectedRoleProfile.role}</strong></div>
                    <div className="saas-admin-detail-field"><span>Permisos obligatorios</span><strong>{Array.isArray(selectedRoleProfile.required) ? selectedRoleProfile.required.length : 0}</strong></div>
                    <div className="saas-admin-detail-field"><span>Permisos opcionales</span><strong>{Array.isArray(selectedRoleProfile.optional) ? selectedRoleProfile.optional.length : 0}</strong></div>
                    <div className="saas-admin-detail-field"><span>Permisos bloqueados</span><strong>{Array.isArray(selectedRoleProfile.blocked) ? selectedRoleProfile.blocked.length : 0}</strong></div>
                    <div className="saas-admin-detail-field"><span>Estado</span><strong>{selectedRoleProfile.active === false ? 'Inactivo' : 'Activo'}</strong></div>
                </div>
                <PermissionList title="Obligatorios" permissions={selectedRoleProfile.required} permissionLabelMap={permissionLabelMap} />
                <PermissionList title="Opcionales" permissions={selectedRoleProfile.optional} permissionLabelMap={permissionLabelMap} />
                <PermissionList title="Bloqueados" permissions={selectedRoleProfile.blocked} permissionLabelMap={permissionLabelMap} />
            </>
        );
    }, [permissionLabelMap, selectedRoleProfile]);

    const renderForm = React.useCallback(() => (
        <>
            <div className="saas-admin-form-row">
                <input
                    value={roleForm.role || ''}
                    onChange={(event) => setRoleForm?.((prev) => ({ ...prev, role: sanitizeRoleCode?.(event.target.value) || '' }))}
                    placeholder="Codigo rol (ej: support_manager)"
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
                <div className="saas-admin-related-list">
                    {rolePermissionOptions.map((permission) => {
                        const permissionKey = String(permission?.key || '').trim();
                        const isRequired = Array.isArray(roleForm.required) && roleForm.required.includes(permissionKey);
                        const isOptional = Array.isArray(roleForm.optional) && roleForm.optional.includes(permissionKey);
                        const isBlocked = Array.isArray(roleForm.blocked) && roleForm.blocked.includes(permissionKey);

                        return (
                            <div key={`role_permission_matrix_${permissionKey}`} className="saas-admin-related-row" role="status">
                                <span>{permission.label || permissionKey}</span>
                                <div className="saas-admin-inline-checks">
                                    <label>
                                        <input type="checkbox" checked={isRequired} onChange={(event) => toggleRolePermission?.('required', permissionKey, event.target.checked)} disabled={busy} />
                                        <small>Obligatorio</small>
                                    </label>
                                    <label>
                                        <input type="checkbox" checked={isOptional} onChange={(event) => toggleRolePermission?.('optional', permissionKey, event.target.checked)} disabled={busy} />
                                        <small>Opcional</small>
                                    </label>
                                    <label>
                                        <input type="checkbox" checked={isBlocked} onChange={(event) => toggleRolePermission?.('blocked', permissionKey, event.target.checked)} disabled={busy} />
                                        <small>Bloqueado</small>
                                    </label>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            <div className="saas-admin-form-row saas-admin-form-row--actions">
                <button type="button" disabled={busy || !String(roleForm.role || selectedRoleKey || '').trim()} onClick={saveRoleProfile}>
                    {rolePanelMode === 'create' ? 'Crear rol' : 'Guardar cambios'}
                </button>
                <button type="button" className="saas-btn-cancel" disabled={busy} onClick={cancelRoleEdit}>Cancelar</button>
            </div>
        </>
    ), [
        busy,
        cancelRoleEdit,
        roleForm,
        rolePanelMode,
        rolePermissionOptions,
        sanitizeRoleCode,
        saveRoleProfile,
        selectedRoleKey,
        selectedRoleProfile,
        setRoleForm,
        toggleRolePermission
    ]);

    const detailActions = React.useMemo(() => {
        if (rolePanelMode !== 'view' || !selectedRoleProfile || !canManageRoles) return null;
        return <button type="button" disabled={busy} onClick={openRoleEdit}>Editar rol</button>;
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
            emptyText="No hay perfiles de rol cargados."
            searchPlaceholder="Buscar rol por nombre, codigo o estado"
            actions={canManageRoles ? [{ key: 'create', label: 'Nuevo rol', onClick: openRoleCreate, disabled: busy }] : []}
            detailTitle={rolePanelMode === 'create' ? 'Nuevo rol' : rolePanelMode === 'edit' ? `Editando rol: ${roleForm.role || selectedRoleKey}` : selectedRoleProfile?.label || selectedRoleProfile?.role || 'Rol'}
            detailSubtitle={isEditing ? 'Define permisos obligatorios, opcionales y bloqueados por perfil.' : 'Catalogo global de perfiles de acceso.'}
            detailActions={detailActions}
        />
    );
}

export default React.memo(RoleProfilesSection);
