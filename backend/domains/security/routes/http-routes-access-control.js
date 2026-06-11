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
    const auditLogService = require('../services/audit-log.service');
    const authService = require('../services/auth.service');
    if (!app) throw new Error('registerSecurityAccessControlHttpRoutes requiere app.');
    if (!saasControlService) throw new Error('registerSecurityAccessControlHttpRoutes requiere saasControlService.');
    if (!aiUsageService) throw new Error('registerSecurityAccessControlHttpRoutes requiere aiUsageService.');
    if (!accessPolicyService) throw new Error('registerSecurityAccessControlHttpRoutes requiere accessPolicyService.');
    if (!planLimitsService) throw new Error('registerSecurityAccessControlHttpRoutes requiere planLimitsService.');
    if (!planLimitsStoreService) throw new Error('registerSecurityAccessControlHttpRoutes requiere planLimitsStoreService.');

    let overviewCache = null;
    let overviewCacheAt = 0;
    const OVERVIEW_CACHE_TTL_MS = 30_000;
    const invalidateOverviewCache = () => {
        overviewCache = null;
        overviewCacheAt = 0;
    };
    app.locals.invalidateSaasOverviewCache = invalidateOverviewCache;

    const buildOverviewResponse = (req, overview = {}) => {
        const scoped = filterAdminOverviewByScope(req, overview);
        const scopedTenantIds = new Set(
            (scoped.tenants || [])
                .map((tenant) => String(tenant?.id || '').trim())
                .filter(Boolean)
        );
        const aiUsage = (overview._aiUsage || [])
            .filter((entry) => scopedTenantIds.has(String(entry?.tenantId || '').trim()));
        return { ok: true, ...scoped, aiUsage };
    };

    app.get('/api/admin/saas/overview', async (req, res) => {
        try {
            if (!hasSaasControlReadAccess(req)) {
                return res.status(403).json({ ok: false, error: 'No tienes permisos para ver el panel SaaS.' });
            }

            const now = Date.now();
            if (overviewCache && (now - overviewCacheAt) < OVERVIEW_CACHE_TTL_MS) {
                return res.json(buildOverviewResponse(req, overviewCache));
            }

            const overview = await saasControlService.getAdminOverview();
            const aiUsage = await Promise.all((overview.tenants || []).map(async (tenant) => ({
                tenantId: tenant.id,
                monthKey: aiUsageService.currentMonthKey(),
                requests: await aiUsageService.getMonthlyUsage(tenant.id)
            })));

            overviewCache = { ...overview, _aiUsage: aiUsage };
            overviewCacheAt = now;

            return res.json(buildOverviewResponse(req, overviewCache));
        } catch (error) {
            return res.status(500).json({ ok: false, error: 'No se pudo cargar el panel SaaS.' });
        }
    });

    app.get('/api/admin/saas/access-profiles', (req, res) => {
        const perfId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const totalLabel = `[perf][/api/admin/saas/access-profiles][${perfId}] total`;
        console.time(totalLabel);
        res.once('finish', () => {
            console.timeEnd(totalLabel);
        });
        if (!hasSaasControlReadAccess(req)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        const actorRole = getAuthRole(req);
        const isActorSuperAdmin = Boolean(req?.authContext?.user?.isSuperAdmin);
        const catalogLabel = `[perf][/api/admin/saas/access-profiles][${perfId}] accessPolicyService.getAccessCatalog`;
        console.time(catalogLabel);
        const catalog = accessPolicyService.getAccessCatalog({
            actorRole,
            isActorSuperAdmin
        });
        console.timeEnd(catalogLabel);

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
            await auditLogService.writeRequestAuditLog(req, {
                action: 'role.updated',
                resourceType: 'role',
                resourceId: roleKey,
                newValue: {
                    role: roleKey,
                    label: String(source.label || '').trim(),
                    required: accessPolicyService.normalizePermissionList(source.required || []),
                    optional: accessPolicyService.normalizePermissionList(source.optional || []),
                    blocked: accessPolicyService.normalizePermissionList(source.blocked || []),
                    active: source.active === undefined ? undefined : source.active !== false
                }
            });
            if (typeof authService.invalidatePermissionsCache === 'function') {
                authService.invalidatePermissionsCache();
            }
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
            await auditLogService.writeRequestAuditLog(req, {
                action: 'role.created',
                resourceType: 'role',
                resourceId: String(source.role || source.id || '').trim().toLowerCase(),
                newValue: {
                    role: String(source.role || source.id || '').trim().toLowerCase(),
                    label: String(source.label || '').trim(),
                    required: accessPolicyService.normalizePermissionList(source.required || []),
                    optional: accessPolicyService.normalizePermissionList(source.optional || []),
                    blocked: accessPolicyService.normalizePermissionList(source.blocked || []),
                    active: source.active === undefined ? true : source.active !== false
                }
            });
            if (typeof authService.invalidatePermissionsCache === 'function') {
                authService.invalidatePermissionsCache();
            }
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
            await auditLogService.writeRequestAuditLog(req, {
                action: 'permission.pack.updated',
                resourceType: 'permission_pack',
                resourceId: packId,
                newValue: {
                    id: packId,
                    label: String(source.label || '').trim(),
                    permissions: accessPolicyService.normalizePermissionList(source.permissions || []),
                    active: source.active === undefined ? undefined : source.active !== false
                }
            });
            if (typeof authService.invalidatePermissionsCache === 'function') {
                authService.invalidatePermissionsCache();
            }
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
            if (typeof authService.invalidatePermissionsCache === 'function') {
                authService.invalidatePermissionsCache();
            }
            return res.status(201).json({ ok: true, ...catalog });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo crear el pack.') });
        }
    });

    app.get('/api/admin/saas/plans', (req, res) => {
        const perfId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const totalLabel = `[perf][/api/admin/saas/plans][${perfId}] total`;
        console.time(totalLabel);
        res.once('finish', () => {
            console.timeEnd(totalLabel);
        });
        if (!hasSaasControlReadAccess(req, { requireSuperAdmin: true })) return res.status(403).json({ ok: false, error: 'No autorizado.' });
        const matrixLabel = `[perf][/api/admin/saas/plans][${perfId}] planLimitsService.getPlanMatrix`;
        console.time(matrixLabel);
        const matrix = planLimitsService.getPlanMatrix();
        console.timeEnd(matrixLabel);
        const overridesLabel = `[perf][/api/admin/saas/plans][${perfId}] planLimitsService.getPlanOverrides`;
        console.time(overridesLabel);
        const overrides = planLimitsService.getPlanOverrides();
        console.timeEnd(overridesLabel);
        return res.json({
            ok: true,
            plans: Object.keys(matrix).map((plan) => ({
                id: plan,
                limits: matrix[plan]
            })),
            overrides
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
            await auditLogService.writeRequestAuditLog(req, {
                action: 'plan.updated',
                resourceType: 'plan',
                resourceId: planId,
                oldValue: current?.[planId] || null,
                newValue: normalized
            });

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

