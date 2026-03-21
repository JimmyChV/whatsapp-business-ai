function registerSecurityAuthHttpRoutes({
    app,
    isProduction,
    authService,
    authRecoveryService,
    auditLogService,
    tenantService,
    toPublicTenant
} = {}) {
    if (!app) throw new Error('registerSecurityAuthHttpRoutes requiere app.');
    if (!authService) throw new Error('registerSecurityAuthHttpRoutes requiere authService.');
    if (!auditLogService) throw new Error('registerSecurityAuthHttpRoutes requiere auditLogService.');
    if (!tenantService) throw new Error('registerSecurityAuthHttpRoutes requiere tenantService.');

    const mapPublicTenant = typeof toPublicTenant === 'function'
        ? toPublicTenant
        : (tenant) => tenant;

    app.post('/api/auth/login', async (req, res) => {
        const email = String(req.body?.email || '').trim().toLowerCase();
        const tenantId = String(req.body?.tenantId || '').trim() || null;
        const tenantSlug = String(req.body?.tenantSlug || '').trim() || null;

        try {
            const password = String(req.body?.password || '');
            const session = await authService.login({ email, password, tenantId, tenantSlug });
            await auditLogService.writeAuditLog(session?.user?.tenantId || req?.tenantContext?.id || 'default', {
                userId: session?.user?.id || null,
                userEmail: session?.user?.email || email,
                role: session?.user?.role || 'seller',
                action: 'auth.login.success',
                resourceType: 'auth',
                resourceId: session?.user?.id || null,
                source: 'api',
                ip: String(req.ip || ''),
                payload: { tenantId: session?.user?.tenantId || tenantId || null, tenantSlug }
            });
            return res.json({ ok: true, ...session });
        } catch (error) {
            const message = String(error?.message || 'No se pudo iniciar sesion.');
            const status = message.toLowerCase().includes('inval') ? 401 : 400;
            await auditLogService.writeAuditLog(tenantId || req?.tenantContext?.id || 'default', {
                userId: null,
                userEmail: email,
                role: 'seller',
                action: 'auth.login.failed',
                resourceType: 'auth',
                resourceId: null,
                source: 'api',
                ip: String(req.ip || ''),
                payload: { tenantId, tenantSlug, reason: message }
            });
            return res.status(status).json({ ok: false, error: message });
        }
    });

    app.post('/api/auth/recovery/request', async (req, res) => {
        const email = String(req.body?.email || '').trim().toLowerCase();
        if (!email) {
            return res.status(400).json({ ok: false, error: 'Correo requerido.' });
        }

        try {
            const result = await authRecoveryService.requestPasswordRecovery({
                email,
                requestIp: String(req.ip || ''),
                requestId: String(req.requestId || '')
            });

            await auditLogService.writeAuditLog(req?.tenantContext?.id || 'default', {
                userId: null,
                userEmail: email,
                role: 'seller',
                action: 'auth.recovery.request',
                resourceType: 'auth',
                resourceId: null,
                source: 'api',
                ip: String(req.ip || ''),
                payload: {
                    accepted: Boolean(result?.accepted)
                }
            });

            const responsePayload = {
                ok: true,
                message: 'Si el correo existe, enviaremos un codigo de recuperacion.'
            };
            if (result?.maskedEmail) responsePayload.maskedEmail = result.maskedEmail;
            if (result?.expiresInSec) responsePayload.expiresInSec = result.expiresInSec;
            if (!isProduction && result?.debugCode) responsePayload.debugCode = result.debugCode;

            return res.json(responsePayload);
        } catch (error) {
            const message = String(error?.message || 'No se pudo iniciar recuperacion.');
            if (/correo requerido|correo invalido/i.test(message)) {
                return res.status(400).json({ ok: false, error: message });
            }
            return res.json({
                ok: true,
                message: 'Si el correo existe, enviaremos un codigo de recuperacion.'
            });
        }
    });

    app.post('/api/auth/recovery/verify', async (req, res) => {
        const email = String(req.body?.email || '').trim().toLowerCase();
        const code = String(req.body?.code || '').trim();

        if (!email || !code) {
            return res.status(400).json({ ok: false, error: 'Correo y codigo son requeridos.' });
        }

        try {
            const result = await authRecoveryService.verifyPasswordRecoveryCode({ email, code });

            await auditLogService.writeAuditLog(req?.tenantContext?.id || 'default', {
                userId: null,
                userEmail: email,
                role: 'seller',
                action: 'auth.recovery.verify',
                resourceType: 'auth',
                resourceId: null,
                source: 'api',
                ip: String(req.ip || ''),
                payload: { ok: true }
            });

            return res.json({
                ok: true,
                resetToken: result.resetToken,
                expiresInSec: result.expiresInSec
            });
        } catch (error) {
            const message = String(error?.message || 'Codigo invalido o expirado.');
            const status = /codigo invalido|expirado/i.test(message) ? 400 : 500;
            return res.status(status).json({ ok: false, error: message });
        }
    });

    app.post('/api/auth/recovery/reset', async (req, res) => {
        const email = String(req.body?.email || '').trim().toLowerCase();
        const resetToken = String(req.body?.resetToken || '').trim();
        const newPassword = String(req.body?.newPassword || '');

        if (!email || !resetToken || !newPassword) {
            return res.status(400).json({ ok: false, error: 'Correo, token y nueva contrasena son requeridos.' });
        }

        try {
            const result = await authRecoveryService.resetPasswordWithRecoveryToken({
                email,
                resetToken,
                newPassword
            });

            await auditLogService.writeAuditLog(req?.tenantContext?.id || 'default', {
                userId: result?.userId || null,
                userEmail: email,
                role: 'seller',
                action: 'auth.recovery.reset',
                resourceType: 'auth',
                resourceId: result?.userId || null,
                source: 'api',
                ip: String(req.ip || ''),
                payload: {
                    revokedSessions: Number(result?.revokedSessions?.updated || 0) || 0
                }
            });

            return res.json({
                ok: true,
                message: 'Contrasena actualizada correctamente.'
            });
        } catch (error) {
            const message = String(error?.message || 'No se pudo actualizar la contrasena.');
            const status = /invalido|expirado|contrasena/i.test(message) ? 400 : 500;
            return res.status(status).json({ ok: false, error: message });
        }
    });

    app.post('/api/auth/refresh', async (req, res) => {
        try {
            const refreshToken = String(req.body?.refreshToken || '').trim();
            if (!refreshToken) {
                return res.status(400).json({ ok: false, error: 'refreshToken es requerido.' });
            }

            const session = await authService.refreshSession({ refreshToken });
            await auditLogService.writeAuditLog(session?.user?.tenantId || req?.tenantContext?.id || 'default', {
                userId: session?.user?.id || null,
                userEmail: session?.user?.email || null,
                role: session?.user?.role || 'seller',
                action: 'auth.refresh.success',
                resourceType: 'auth',
                resourceId: session?.user?.id || null,
                source: 'api',
                ip: String(req.ip || ''),
                payload: {}
            });

            return res.json({ ok: true, ...session });
        } catch (error) {
            const message = String(error?.message || 'No se pudo renovar sesion.');
            return res.status(401).json({ ok: false, error: message });
        }
    });

    app.post('/api/auth/switch-tenant', async (req, res) => {
        try {
            const authContext = req.authContext || { isAuthenticated: false, user: null };
            if (authService.isAuthEnabled() && (!authContext.isAuthenticated || !authContext.user)) {
                return res.status(401).json({ ok: false, error: 'No autenticado.' });
            }

            const accessToken = String(authService.getTokenFromRequest(req) || req.body?.accessToken || '').trim();
            const refreshToken = String(req.body?.refreshToken || '').trim();
            const targetTenantId = String(req.body?.targetTenantId || '').trim();

            if (!targetTenantId) {
                return res.status(400).json({ ok: false, error: 'targetTenantId es requerido.' });
            }

            const session = await authService.switchTenantSession({
                accessToken,
                refreshToken,
                targetTenantId
            });

            await auditLogService.writeAuditLog(targetTenantId, {
                userId: session?.user?.id || authContext?.user?.userId || null,
                userEmail: session?.user?.email || authContext?.user?.email || null,
                role: session?.user?.role || authContext?.user?.role || 'seller',
                action: 'auth.tenant.switch.success',
                resourceType: 'auth',
                resourceId: session?.user?.id || null,
                source: 'api',
                ip: String(req.ip || ''),
                payload: {
                    fromTenantId: authContext?.user?.tenantId || null,
                    toTenantId: targetTenantId
                }
            });

            return res.json({ ok: true, ...session });
        } catch (error) {
            const message = String(error?.message || 'No se pudo cambiar de empresa.');
            const status = /acceso|requerido|invalida|expirada/i.test(message) ? 400 : 500;
            return res.status(status).json({ ok: false, error: message });
        }
    });

    app.post('/api/auth/logout', async (req, res) => {
        try {
            const accessTokenFromRequest = authService.getTokenFromRequest(req);
            const accessToken = String(req.body?.accessToken || accessTokenFromRequest || '').trim();
            const refreshToken = String(req.body?.refreshToken || '').trim();

            if (!accessToken && !refreshToken) {
                return res.status(400).json({ ok: false, error: 'Debes enviar access token o refresh token.' });
            }

            const result = await authService.logoutSession({
                accessToken,
                refreshToken,
                reason: 'api_logout'
            });

            if (!result.ok) {
                return res.status(400).json({ ok: false, error: 'No se pudo cerrar la sesion (tokens invalidos o expirados).' });
            }

            await auditLogService.writeAuditLog(result?.user?.tenantId || req?.tenantContext?.id || 'default', {
                userId: result?.user?.id || null,
                userEmail: result?.user?.email || null,
                role: result?.user?.role || 'seller',
                action: 'auth.logout.success',
                resourceType: 'auth',
                resourceId: result?.user?.id || null,
                source: 'api',
                ip: String(req.ip || ''),
                payload: {
                    revokedAccess: Boolean(result.revokedAccess),
                    revokedRefresh: Boolean(result.revokedRefresh)
                }
            });

            return res.json({ ok: true, ...result });
        } catch (error) {
            return res.status(500).json({ ok: false, error: 'No se pudo cerrar sesion.' });
        }
    });

    app.get('/api/auth/me', (req, res) => {
        const authContext = req.authContext || { isAuthenticated: false, user: null };
        if (!authContext.isAuthenticated || !authContext.user) {
            return res.status(401).json({ ok: false, error: 'No autenticado.' });
        }

        const allowedTenants = authService
            .getAllowedTenantsForUser(authContext.user || {}, tenantService.getTenants())
            .map(mapPublicTenant)
            .filter(Boolean);

        return res.json({
            ok: true,
            user: authContext.user,
            tenant: mapPublicTenant(req.tenantContext || tenantService.DEFAULT_TENANT),
            tenants: allowedTenants
        });
    });

    app.get('/api/tenant/me', (req, res) => {
        return res.json({
            ok: true,
            tenant: req.tenantContext || tenantService.DEFAULT_TENANT
        });
    });
}

module.exports = {
    registerSecurityAuthHttpRoutes
};
