function registerTenantAdminTenantsUsersHttpRoutes({
    app,
    saasControlService,
    waModuleService,
    hasSaasControlReadAccess,
    hasSaasControlWriteAccess,
    hasTenantAdminWriteAccess,
    hasTenantModuleReadAccess,
    isTenantAllowedForUser,
    sanitizeTenantPayload,
    sanitizeUserPayload,
    sanitizeMembershipPayload,
    resolvePrimaryRoleFromMemberships,
    canActorAssignRole,
    hasAnyAccessOverride,
    canActorEditOptionalAccess,
    getUserPrimaryRole,
    isSelfUserAction,
    isActorSuperiorToRole,
    canActorManageRoleChanges
}) {
    if (!app) throw new Error('registerTenantAdminTenantsUsersHttpRoutes requiere app.');

    app.get('/api/admin/saas/tenants', async (req, res) => {
        try {
            if (!hasSaasControlReadAccess(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });

            const tenants = await saasControlService.listTenants({ includeInactive: true });
            const scoped = req?.authContext?.user?.isSuperAdmin
                ? tenants
                : tenants.filter((tenant) => isTenantAllowedForUser(req, tenant.id));

            return res.json({ ok: true, items: scoped.map((tenant) => saasControlService.sanitizeTenantPublic(tenant)) });
        } catch (error) {
            return res.status(500).json({ ok: false, error: 'No se pudieron cargar las empresas.' });
        }
    });

    app.post('/api/admin/saas/tenants', async (req, res) => {
        try {
            if (!hasSaasControlWriteAccess(req, { requireSuperAdmin: true })) {
                return res.status(403).json({ ok: false, error: 'Solo superadmin puede crear empresas.' });
            }

            const payload = sanitizeTenantPayload(req.body);
            const snapshot = await saasControlService.createTenant(payload);
            const createdId = String(payload.id || payload.tenantId || '').trim();
            const tenant = Array.isArray(snapshot?.tenants) ? snapshot.tenants.find((item) => item.id === createdId) : null;

            return res.status(201).json({ ok: true, tenant: tenant ? saasControlService.sanitizeTenantPublic(tenant) : null });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo crear empresa.') });
        }
    });

    app.put('/api/admin/saas/tenants/:tenantId', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!hasSaasControlWriteAccess(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
        if (!isTenantAllowedForUser(req, tenantId) && !req?.authContext?.user?.isSuperAdmin) return res.status(403).json({ ok: false, error: 'No tienes acceso a esta empresa.' });

        try {
            const payload = sanitizeTenantPayload(req.body);
            const snapshot = await saasControlService.updateTenant(tenantId, payload);
            const tenant = Array.isArray(snapshot?.tenants) ? snapshot.tenants.find((item) => item.id === tenantId) : null;
            return res.json({ ok: true, tenant: tenant ? saasControlService.sanitizeTenantPublic(tenant) : null });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar empresa.') });
        }
    });

    app.delete('/api/admin/saas/tenants/:tenantId', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!hasSaasControlWriteAccess(req, { requireSuperAdmin: true })) return res.status(403).json({ ok: false, error: 'Solo superadmin puede desactivar empresas.' });

        try {
            await saasControlService.deleteTenant(tenantId);
            return res.json({ ok: true });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo desactivar empresa.') });
        }
    });

    app.get('/api/admin/saas/users', async (req, res) => {
        try {
            if (!hasSaasControlReadAccess(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });

            const tenantId = String(req.query?.tenantId || '').trim();
            if (tenantId && !isTenantAllowedForUser(req, tenantId)) return res.status(403).json({ ok: false, error: 'No tienes acceso a ese tenant.' });

            const users = await saasControlService.listUsers({ includeInactive: true, tenantId: tenantId || '' });
            const scoped = req?.authContext?.user?.isSuperAdmin
                ? users
                : users.filter((user) => (Array.isArray(user?.memberships) ? user.memberships : []).some((membership) => isTenantAllowedForUser(req, membership?.tenantId)));

            return res.json({ ok: true, items: scoped.map((user) => saasControlService.sanitizeUserPublic(user)) });
        } catch (error) {
            return res.status(500).json({ ok: false, error: 'No se pudieron cargar usuarios.' });
        }
    });

    app.post('/api/admin/saas/users', async (req, res) => {
        try {
            if (!hasTenantAdminWriteAccess(req)) return res.status(403).json({ ok: false, error: 'No autorizado para crear usuarios.' });

            const payload = sanitizeUserPayload(req.body, { allowMemberships: true });
            payload.memberships = sanitizeMembershipPayload(payload.memberships);

            if (!payload.memberships.length) {
                return res.status(400).json({ ok: false, error: 'Debes asignar al menos una empresa al usuario.' });
            }

            const targetRole = resolvePrimaryRoleFromMemberships(payload.memberships, payload.role || 'seller');
            if (!canActorAssignRole(req, targetRole)) {
                return res.status(403).json({ ok: false, error: 'No tienes permisos para asignar ese rol.' });
            }

            if (!req?.authContext?.user?.isSuperAdmin) {
                const invalid = payload.memberships.some((membership) => !isTenantAllowedForUser(req, membership.tenantId));
                if (invalid) return res.status(403).json({ ok: false, error: 'No puedes asignar empresas fuera de tu alcance.' });
                if (hasAnyAccessOverride(payload) && !canActorEditOptionalAccess(req)) {
                    return res.status(403).json({ ok: false, error: 'No tienes permisos para editar accesos opcionales.' });
                }
            }

            delete payload.role;
            const snapshot = await saasControlService.createUser(payload);
            const createdId = String(payload.id || payload.userId || '').trim();
            const user = Array.isArray(snapshot?.users)
                ? snapshot.users.find((item) => {
                    if (createdId && String(item?.id || '').trim() === createdId) return true;
                    return String(item?.email || '').trim().toLowerCase() === String(payload.email || '').trim().toLowerCase();
                })
                : null;
            return res.status(201).json({ ok: true, user: user ? saasControlService.sanitizeUserPublic(user) : null });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo crear usuario.') });
        }
    });

    app.put('/api/admin/saas/users/:userId', async (req, res) => {
        try {
            if (!hasTenantAdminWriteAccess(req)) return res.status(403).json({ ok: false, error: 'No autorizado para editar usuarios.' });
            const userId = String(req.params?.userId || '').trim();
            if (!userId) return res.status(400).json({ ok: false, error: 'userId invalido.' });

            const currentUsers = await saasControlService.listUsers({ includeInactive: true });
            const targetUser = (Array.isArray(currentUsers) ? currentUsers : []).find((item) => String(item?.id || '').trim() === userId) || null;
            if (!targetUser) return res.status(404).json({ ok: false, error: 'Usuario no encontrado.' });

            const payload = sanitizeUserPayload(req.body, { allowMemberships: true });
            if (payload.memberships) payload.memberships = sanitizeMembershipPayload(payload.memberships);

            if (Object.prototype.hasOwnProperty.call(payload, 'role') && !Array.isArray(payload.memberships)) {
                const currentMemberships = sanitizeMembershipPayload(targetUser.memberships || []);
                const currentTenantId = String(currentMemberships[0]?.tenantId || '').trim();
                payload.memberships = sanitizeMembershipPayload([{ tenantId: currentTenantId, role: payload.role, active: true }]);
            }

            const resultingMemberships = Array.isArray(payload.memberships) && payload.memberships.length > 0
                ? payload.memberships
                : sanitizeMembershipPayload(targetUser.memberships || []);

            const targetRoleBefore = getUserPrimaryRole(targetUser);
            const targetRoleAfter = resolvePrimaryRoleFromMemberships(resultingMemberships, payload.role || targetRoleBefore || 'seller');
            const isSelf = isSelfUserAction(req, userId);
            const touchesRole = Boolean(Array.isArray(payload.memberships) || Object.prototype.hasOwnProperty.call(payload, 'role'));
            const touchesOptionalAccess = hasAnyAccessOverride(payload);

            if (!req?.authContext?.user?.isSuperAdmin) {
                const targetInScope = sanitizeMembershipPayload(targetUser.memberships || []).some((membership) => isTenantAllowedForUser(req, membership.tenantId));
                if (!targetInScope) {
                    return res.status(403).json({ ok: false, error: 'No puedes editar usuarios fuera de tu alcance.' });
                }

                const invalid = resultingMemberships.some((membership) => !isTenantAllowedForUser(req, membership.tenantId));
                if (invalid) return res.status(403).json({ ok: false, error: 'No puedes asignar empresas fuera de tu alcance.' });

                if (!isSelf && !isActorSuperiorToRole(req, targetRoleBefore)) {
                    return res.status(403).json({ ok: false, error: 'No puedes editar usuarios con rol igual o superior al tuyo.' });
                }

                if (touchesRole) {
                    if (isSelf) {
                        return res.status(403).json({ ok: false, error: 'No puedes editar tu propio rol.' });
                    }
                    if (!canActorManageRoleChanges(req)) {
                        return res.status(403).json({ ok: false, error: 'No tienes permisos para editar roles de usuarios.' });
                    }
                    if (!canActorAssignRole(req, targetRoleAfter)) {
                        return res.status(403).json({ ok: false, error: 'No tienes permisos para administrar ese rol.' });
                    }
                }

                if (touchesOptionalAccess) {
                    if (isSelf) {
                        return res.status(403).json({ ok: false, error: 'No puedes editar tus propios accesos opcionales.' });
                    }
                    if (!canActorEditOptionalAccess(req)) {
                        return res.status(403).json({ ok: false, error: 'No tienes permisos para editar accesos opcionales.' });
                    }
                }
            }

            delete payload.role;
            const snapshot = await saasControlService.updateUser(userId, payload);
            const user = Array.isArray(snapshot?.users) ? snapshot.users.find((item) => item.id === userId) : null;
            return res.json({ ok: true, user: user ? saasControlService.sanitizeUserPublic(user) : null });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar usuario.') });
        }
    });

    app.put('/api/admin/saas/users/:userId/memberships', async (req, res) => {
        try {
            if (!hasTenantAdminWriteAccess(req)) return res.status(403).json({ ok: false, error: 'No autorizado para editar membresias.' });
            const userId = String(req.params?.userId || '').trim();
            if (!userId) return res.status(400).json({ ok: false, error: 'userId invalido.' });

            const memberships = sanitizeMembershipPayload(req.body?.memberships || []);
            if (!memberships.length) return res.status(400).json({ ok: false, error: 'Debes enviar al menos una membresia.' });

            const currentUsers = await saasControlService.listUsers({ includeInactive: true });
            const targetUser = (Array.isArray(currentUsers) ? currentUsers : []).find((item) => String(item?.id || '').trim() === userId) || null;
            if (!targetUser) return res.status(404).json({ ok: false, error: 'Usuario no encontrado.' });

            const targetRoleBefore = getUserPrimaryRole(targetUser);
            const targetRole = resolvePrimaryRoleFromMemberships(memberships, targetRoleBefore || 'seller');
            const isSelf = isSelfUserAction(req, userId);

            if (!req?.authContext?.user?.isSuperAdmin) {
                const targetInScope = sanitizeMembershipPayload(targetUser.memberships || []).some((membership) => isTenantAllowedForUser(req, membership.tenantId));
                if (!targetInScope) return res.status(403).json({ ok: false, error: 'No puedes editar usuarios fuera de tu alcance.' });

                if (isSelf) return res.status(403).json({ ok: false, error: 'No puedes editar tu propio rol.' });
                if (!isActorSuperiorToRole(req, targetRoleBefore)) {
                    return res.status(403).json({ ok: false, error: 'No puedes editar usuarios con rol igual o superior al tuyo.' });
                }
                if (!canActorManageRoleChanges(req)) {
                    return res.status(403).json({ ok: false, error: 'No tienes permisos para editar roles de usuarios.' });
                }

                const invalid = memberships.some((membership) => !isTenantAllowedForUser(req, membership.tenantId));
                if (invalid) return res.status(403).json({ ok: false, error: 'No puedes asignar empresas fuera de tu alcance.' });
            }

            if (!canActorAssignRole(req, targetRole)) {
                return res.status(403).json({ ok: false, error: 'No tienes permisos para asignar ese rol.' });
            }

            const snapshot = await saasControlService.setUserMemberships(userId, memberships);
            const user = Array.isArray(snapshot?.users) ? snapshot.users.find((item) => item.id === userId) : null;
            return res.json({ ok: true, user: user ? saasControlService.sanitizeUserPublic(user) : null });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar membresias.') });
        }
    });

    app.delete('/api/admin/saas/users/:userId', async (req, res) => {
        try {
            if (!hasTenantAdminWriteAccess(req)) return res.status(403).json({ ok: false, error: 'No autorizado para desactivar usuarios.' });
            const userId = String(req.params?.userId || '').trim();
            if (!userId) return res.status(400).json({ ok: false, error: 'userId invalido.' });

            const currentUsers = await saasControlService.listUsers({ includeInactive: true });
            const targetUser = (Array.isArray(currentUsers) ? currentUsers : []).find((item) => String(item?.id || '').trim() === userId) || null;
            if (!targetUser) return res.status(404).json({ ok: false, error: 'Usuario no encontrado.' });

            const targetRole = getUserPrimaryRole(targetUser);
            const isSelf = isSelfUserAction(req, userId);

            if (!req?.authContext?.user?.isSuperAdmin) {
                const memberships = sanitizeMembershipPayload(targetUser.memberships || []);
                const targetInScope = memberships.some((membership) => isTenantAllowedForUser(req, membership.tenantId));
                if (!targetInScope) return res.status(403).json({ ok: false, error: 'No puedes desactivar usuarios fuera de tu alcance.' });

                if (isSelf) {
                    return res.status(403).json({ ok: false, error: 'No puedes desactivar tu propio usuario.' });
                }

                if (!isActorSuperiorToRole(req, targetRole)) {
                    return res.status(403).json({ ok: false, error: 'No puedes desactivar usuarios con rol igual o superior al tuyo.' });
                }

                if (!canActorAssignRole(req, targetRole)) {
                    return res.status(403).json({ ok: false, error: 'No tienes permisos para desactivar ese rol.' });
                }
            }

            await saasControlService.deleteUser(userId);
            return res.json({ ok: true });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo desactivar usuario.') });
        }
    });

    app.get('/api/admin/saas/tenants/:tenantId/wa-modules', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!hasTenantModuleReadAccess(req, tenantId)) return res.status(403).json({ ok: false, error: 'No autorizado.' });

        try {
            const items = await waModuleService.listModules(tenantId, { includeInactive: true });
            const selected = await waModuleService.getSelectedModule(tenantId);
            return res.json({ ok: true, tenantId, items, selected });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar modulos WA.') });
        }
    });
}

module.exports = {
    registerTenantAdminTenantsUsersHttpRoutes
};
