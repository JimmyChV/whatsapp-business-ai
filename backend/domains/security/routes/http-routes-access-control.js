function registerSecurityAccessControlHttpRoutes({
    app,
    saasControlService,
    aiUsageService,
    accessPolicyService,
    planLimitsService,
    planLimitsStoreService,
    hasSaasControlReadAccess,
    hasSaasControlWriteAccess,
    getAuthRole,
    filterAdminOverviewByScope,
    sanitizeObjectPayload
} = {}) {
    if (!app) throw new Error('registerSecurityAccessControlHttpRoutes requiere app.');
    if (!saasControlService) throw new Error('registerSecurityAccessControlHttpRoutes requiere saasControlService.');
    if (!aiUsageService) throw new Error('registerSecurityAccessControlHttpRoutes requiere aiUsageService.');
    if (!accessPolicyService) throw new Error('registerSecurityAccessControlHttpRoutes requiere accessPolicyService.');
    if (!planLimitsService) throw new Error('registerSecurityAccessControlHttpRoutes requiere planLimitsService.');
    if (!planLimitsStoreService) throw new Error('registerSecurityAccessControlHttpRoutes requiere planLimitsStoreService.');

    app.get('/api/admin/saas/overview', async (req, res) => {
        try {
            if (!hasSaasControlReadAccess(req)) {
                return res.status(403).json({ ok: false, error: 'No tienes permisos para ver el panel SaaS.' });
            }

            const overview = await saasControlService.getAdminOverview();
            const scoped = filterAdminOverviewByScope(req, overview);
            const aiUsage = await Promise.all((scoped.tenants || []).map(async (tenant) => ({
                tenantId: tenant.id,
                monthKey: aiUsageService.currentMonthKey(),
                requests: await aiUsageService.getMonthlyUsage(tenant.id)
            })));

            return res.json({ ok: true, ...scoped, aiUsage });
        } catch (error) {
            return res.status(500).json({ ok: false, error: 'No se pudo cargar el panel SaaS.' });
        }
    });

    app.get('/api/admin/saas/access-profiles', (req, res) => {
        if (!hasSaasControlReadAccess(req)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        const actorRole = getAuthRole(req);
        const isActorSuperAdmin = Boolean(req?.authContext?.user?.isSuperAdmin);
        const catalog = accessPolicyService.getAccessCatalog({
            actorRole,
            isActorSuperAdmin
        });

        return res.json({ ok: true, ...catalog });
    });

    app.put('/api/admin/saas/access-profiles/roles/:roleKey', async (req, res) => {
        if (!hasSaasControlWriteAccess(req, { requireSuperAdmin: true })) {
            return res.status(403).json({ ok: false, error: 'Solo superadmin puede editar roles.' });
        }

        const roleKey = String(req.params?.roleKey || '').trim().toLowerCase();
        if (!roleKey) return res.status(400).json({ ok: false, error: 'roleKey invalido.' });

        const source = sanitizeObjectPayload(req.body);
        try {
            await accessPolicyService.persistRoleProfile({
                role: roleKey,
                label: String(source.label || '').trim(),
                required: accessPolicyService.normalizePermissionList(source.required || []),
                optional: accessPolicyService.normalizePermissionList(source.optional || []),
                blocked: accessPolicyService.normalizePermissionList(source.blocked || []),
                active: source.active === undefined ? undefined : source.active !== false
            });

            const actorRole = getAuthRole(req);
            const isActorSuperAdmin = Boolean(req?.authContext?.user?.isSuperAdmin);
            const catalog = accessPolicyService.getAccessCatalog({ actorRole, isActorSuperAdmin });
            return res.json({ ok: true, ...catalog });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo guardar el rol.') });
        }
    });

    app.post('/api/admin/saas/access-profiles/roles', async (req, res) => {
        if (!hasSaasControlWriteAccess(req, { requireSuperAdmin: true })) {
            return res.status(403).json({ ok: false, error: 'Solo superadmin puede crear roles.' });
        }

        const source = sanitizeObjectPayload(req.body);
        try {
            await accessPolicyService.persistRoleProfile({
                role: String(source.role || source.id || '').trim().toLowerCase(),
                label: String(source.label || '').trim(),
                required: accessPolicyService.normalizePermissionList(source.required || []),
                optional: accessPolicyService.normalizePermissionList(source.optional || []),
                blocked: accessPolicyService.normalizePermissionList(source.blocked || []),
                active: source.active === undefined ? true : source.active !== false
            });

            const actorRole = getAuthRole(req);
            const isActorSuperAdmin = Boolean(req?.authContext?.user?.isSuperAdmin);
            const catalog = accessPolicyService.getAccessCatalog({ actorRole, isActorSuperAdmin });
            return res.status(201).json({ ok: true, ...catalog });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo crear el rol.') });
        }
    });

    app.put('/api/admin/saas/access-profiles/packs/:packId', async (req, res) => {
        if (!hasSaasControlWriteAccess(req, { requireSuperAdmin: true })) {
            return res.status(403).json({ ok: false, error: 'Solo superadmin puede editar packs.' });
        }

        const packId = String(req.params?.packId || '').trim().toLowerCase();
        if (!packId) return res.status(400).json({ ok: false, error: 'packId invalido.' });

        const source = sanitizeObjectPayload(req.body);
        try {
            await accessPolicyService.persistPermissionPack({
                id: packId,
                label: String(source.label || '').trim(),
                permissions: accessPolicyService.normalizePermissionList(source.permissions || []),
                active: source.active === undefined ? undefined : source.active !== false
            });

            const actorRole = getAuthRole(req);
            const isActorSuperAdmin = Boolean(req?.authContext?.user?.isSuperAdmin);
            const catalog = accessPolicyService.getAccessCatalog({ actorRole, isActorSuperAdmin });
            return res.json({ ok: true, ...catalog });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo guardar el pack.') });
        }
    });

    app.post('/api/admin/saas/access-profiles/packs', async (req, res) => {
        if (!hasSaasControlWriteAccess(req, { requireSuperAdmin: true })) {
            return res.status(403).json({ ok: false, error: 'Solo superadmin puede crear packs.' });
        }

        const source = sanitizeObjectPayload(req.body);
        try {
            await accessPolicyService.persistPermissionPack({
                id: String(source.id || source.packId || '').trim().toLowerCase(),
                label: String(source.label || '').trim(),
                permissions: accessPolicyService.normalizePermissionList(source.permissions || []),
                active: source.active === undefined ? true : source.active !== false
            });

            const actorRole = getAuthRole(req);
            const isActorSuperAdmin = Boolean(req?.authContext?.user?.isSuperAdmin);
            const catalog = accessPolicyService.getAccessCatalog({ actorRole, isActorSuperAdmin });
            return res.status(201).json({ ok: true, ...catalog });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo crear el pack.') });
        }
    });

    app.get('/api/admin/saas/plans', (req, res) => {
        if (!hasSaasControlReadAccess(req, { requireSuperAdmin: true })) return res.status(403).json({ ok: false, error: 'No autorizado.' });
        const matrix = planLimitsService.getPlanMatrix();
        return res.json({
            ok: true,
            plans: Object.keys(matrix).map((plan) => ({
                id: plan,
                limits: matrix[plan]
            })),
            overrides: planLimitsService.getPlanOverrides()
        });
    });

    app.put('/api/admin/saas/plans/:planId', async (req, res) => {
        if (!hasSaasControlWriteAccess(req, { requireSuperAdmin: true })) return res.status(403).json({ ok: false, error: 'Solo superadmin puede editar planes.' });
        try {
            const planId = String(req.params?.planId || '').trim().toLowerCase();
            if (!planId) return res.status(400).json({ ok: false, error: 'planId invalido.' });

            const patch = req.body && typeof req.body === 'object' ? req.body : {};
            const current = planLimitsService.getPlanOverrides();
            const mergedPlanPatch = {
                ...(current?.[planId] && typeof current[planId] === 'object' ? current[planId] : {}),
                ...patch
            };
            const normalized = planLimitsService.normalizePlanLimits(
                mergedPlanPatch,
                planLimitsService.getPlanLimits(planId)
            );

            const nextOverrides = {
                ...current,
                [planId]: normalized
            };
            planLimitsService.setPlanOverrides(nextOverrides);
            await planLimitsStoreService.saveOverrides(nextOverrides);

            return res.json({
                ok: true,
                plan: {
                    id: planId,
                    limits: planLimitsService.getPlanLimits(planId)
                }
            });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar el plan.') });
        }
    });
}

module.exports = {
    registerSecurityAccessControlHttpRoutes
};

