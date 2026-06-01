function registerSecurityAuthHttpRoutes({
    app,
    isProduction,
    authService,
    deviceAuthService,
    authRecoveryService,
    auditLogService,
    tenantService,
    toPublicTenant,
    accessPolicyService
} = {}) {
    if (!app) throw new Error('registerSecurityAuthHttpRoutes requiere app.');
    if (!authService) throw new Error('registerSecurityAuthHttpRoutes requiere authService.');
    if (!auditLogService) throw new Error('registerSecurityAuthHttpRoutes requiere auditLogService.');
    if (!tenantService) throw new Error('registerSecurityAuthHttpRoutes requiere tenantService.');

    const mapPublicTenant = typeof toPublicTenant === 'function'
        ? toPublicTenant
        : (tenant) => tenant;
    const resolvedDeviceAuthService = deviceAuthService || require('../services/device-auth.service');
    const resolvedAccessPolicyService = accessPolicyService || require('../services/access-policy.service');
    const { queryPostgres } = require('../../../config/persistence-runtime');
    const refreshCookieName = 'saas_refresh_token';
    const deviceCookieName = 'saas_device_id';
    const loginAttemptWindowMinutes = 15;
    const loginAttemptMaxFailures = 5;
    const loginAttemptRetryAfterSec = loginAttemptWindowMinutes * 60;

    function parseCookies(req = {}) {
        const header = String(req.headers?.cookie || '').trim();
        if (!header) return {};
        return header.split(';').reduce((acc, part) => {
            const index = part.indexOf('=');
            if (index <= 0) return acc;
            const key = decodeURIComponent(part.slice(0, index).trim());
            const value = decodeURIComponent(part.slice(index + 1).trim());
            if (key) acc[key] = value;
            return acc;
        }, {});
    }

    function getRefreshTokenFromRequest(req = {}) {
        return String(parseCookies(req)[refreshCookieName] || '').trim();
    }

    function getDeviceIdFromRequest(req = {}) {
        return String(parseCookies(req)[deviceCookieName] || '').trim();
    }

    function getClientIp(req = {}) {
        return String(req.headers?.['x-forwarded-for'] || req.ip || '')
            .split(',')[0]
            .trim();
    }

    function getLoginIdentifier(email = '', req = {}) {
        return String(email || getClientIp(req) || 'unknown').trim().toLowerCase();
    }

    async function countRecentFailedLoginAttempts(identifier = '') {
        const cleanIdentifier = String(identifier || '').trim().toLowerCase();
        if (!cleanIdentifier) return 0;
        try {
            const result = await queryPostgres(`
                SELECT COUNT(*)::int AS count
                FROM auth_login_attempts
                WHERE identifier = $1
                  AND success = false
                  AND attempt_at > NOW() - INTERVAL '${loginAttemptWindowMinutes} minutes'
            `, [cleanIdentifier]);
            return Number(result.rows?.[0]?.count || 0);
        } catch (error) {
            console.warn('[Auth] login attempt check failed:', String(error?.message || error));
            return 0;
        }
    }

    async function recordLoginAttempt({ identifier = '', tenantId = null, success = false, ipAddress = '' } = {}) {
        const cleanIdentifier = String(identifier || '').trim().toLowerCase();
        if (!cleanIdentifier) return;
        try {
            await queryPostgres(`
                INSERT INTO auth_login_attempts (identifier, tenant_id, success, ip_address)
                VALUES ($1, $2, $3, $4)
            `, [cleanIdentifier, tenantId || null, Boolean(success), String(ipAddress || '').trim() || null]);
            if (success) {
                await queryPostgres(`
                    DELETE FROM auth_login_attempts
                    WHERE identifier = $1
                      AND success = false
                      AND attempt_at > NOW() - INTERVAL '${loginAttemptWindowMinutes} minutes'
                `, [cleanIdentifier]);
            }
        } catch (error) {
            console.warn('[Auth] login attempt record failed:', String(error?.message || error));
        }
    }

    function isCredentialFailure(message = '') {
        return /credenciales|sin acceso|invalid/i.test(String(message || ''));
    }

    function setDeviceCookie(res, deviceId = '') {
        const cleanDeviceId = String(deviceId || '').trim();
        if (!cleanDeviceId) return;
        res.cookie(deviceCookieName, cleanDeviceId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 365 * 24 * 60 * 60 * 1000
        });
    }

    function setRefreshCookie(res, refreshToken = '', session = {}) {
        const token = String(refreshToken || '').trim();
        if (!token) return;
        const maxAge = Number(session?.refreshExpiresInSec || 0) > 0
            ? Number(session.refreshExpiresInSec) * 1000
            : 30 * 24 * 60 * 60 * 1000;
        res.cookie(refreshCookieName, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge
        });
    }

    function clearRefreshCookie(res) {
        res.clearCookie(refreshCookieName, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
        });
    }

    function stripRefreshToken(session = {}) {
        const { refreshToken: _refreshToken, ...safeSession } = session || {};
        return safeSession;
    }

    function buildDeviceContext(req = {}, deviceId = '') {
        const userAgent = String(req.headers?.['user-agent'] || '').trim();
        return {
            deviceId: String(deviceId || '').trim(),
            userAgent,
            deviceType: resolvedDeviceAuthService.detectDeviceType(userAgent),
            ipAddress: String(req.ip || req.headers?.['x-forwarded-for'] || '').split(',')[0].trim()
        };
    }

    function getAuthenticatedUser(req = {}) {
        const authContext = req.authContext || { isAuthenticated: false, user: null };
        if (!authContext.isAuthenticated || !authContext.user) return null;
        return authContext.user;
    }

    function getAuthenticatedUserId(req = {}) {
        const user = getAuthenticatedUser(req);
        return String(user?.userId || user?.id || '').trim();
    }

    function canManageUserDevices(req = {}) {
        return hasDevicePermission(req, resolvedAccessPolicyService.PERMISSIONS.DEVICES_VIEW_ALL);
    }

    function canRevokeAnyUserDevice(req = {}) {
        return hasDevicePermission(req, resolvedAccessPolicyService.PERMISSIONS.DEVICES_REVOKE_ALL);
    }

    function hasDevicePermission(req = {}, permission = '') {
        const user = getAuthenticatedUser(req);
        if (!user) return false;
        if (user.isSuperAdmin === true) return true;
        const key = String(permission || '').trim();
        const permissions = Array.isArray(user.permissions) ? user.permissions : [];
        return permissions.map((entry) => String(entry || '').trim()).includes(key);
    }

    app.post('/api/auth/login', async (req, res) => {
        const email = String(req.body?.email || '').trim().toLowerCase();
        const tenantId = String(req.body?.tenantId || '').trim() || null;
        const tenantSlug = String(req.body?.tenantSlug || '').trim() || null;
        const ipAddress = getClientIp(req);
        const loginIdentifier = getLoginIdentifier(email, req);

        try {
            const failedAttempts = await countRecentFailedLoginAttempts(loginIdentifier);
            if (failedAttempts >= loginAttemptMaxFailures) {
                res.setHeader('Retry-After', String(loginAttemptRetryAfterSec));
                return res.status(429).json({
                    ok: false,
                    error: 'too_many_attempts',
                    message: 'Demasiados intentos. Espera 15 minutos.',
                    retryAfter: loginAttemptRetryAfterSec
                });
            }
            const password = String(req.body?.password || '');
            const deviceId = getDeviceIdFromRequest(req) || resolvedDeviceAuthService.generateDeviceId();
            setDeviceCookie(res, deviceId);
            const session = await authService.login({
                email,
                password,
                tenantId,
                tenantSlug,
                deviceContext: buildDeviceContext(req, deviceId)
            });
            await recordLoginAttempt({ identifier: loginIdentifier, tenantId, success: true, ipAddress });
            if (session?.requiresOtp) {
                await auditLogService.writeAuditLog(tenantId || req?.tenantContext?.id || 'default', {
                    userId: null,
                    userEmail: email,
                    role: 'seller',
                    action: 'auth.login.otp_required',
                    resourceType: 'auth_device',
                    resourceId: session.deviceId || deviceId,
                    source: 'api',
                    ip: String(req.ip || ''),
                    payload: { tenantId, tenantSlug, deviceType: session.deviceType || null }
                });
                return res.json({
                    ok: true,
                    requiresOtp: true,
                    reauthorization: Boolean(session.reauthorization),
                    deviceId: session.deviceId || deviceId,
                    deviceType: session.deviceType || null,
                    email: session.email || email,
                    expiresInSec: session.expiresInSec || 600,
                    message: 'OTP enviado'
                });
            }
            if (session?.requiresDeviceReauthorization) {
                return res.json({
                    ok: true,
                    requiresDeviceReauthorization: true,
                    deviceId: session.deviceId || deviceId,
                    deviceType: session.deviceType || null,
                    email: session.email || email,
                    message: session.message || 'Este dispositivo fue revocado. Comunicate con un administrador para solicitar nueva autorizacion.'
                });
            }
            setRefreshCookie(res, session?.refreshToken, session);
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
            return res.json({ ok: true, ...stripRefreshToken(session) });
        } catch (error) {
            const message = String(error?.message || 'No se pudo iniciar sesion.');
            const status = message.toLowerCase().includes('inval') ? 401 : 400;
            if (isCredentialFailure(message)) {
                await recordLoginAttempt({ identifier: loginIdentifier, tenantId, success: false, ipAddress });
            }
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

    app.post('/api/auth/verify-otp', async (req, res) => {
        const deviceId = String(req.body?.deviceId || getDeviceIdFromRequest(req) || '').trim();
        const code = String(req.body?.code || '').trim();
        const deviceName = String(req.body?.deviceName || '').trim();

        if (!deviceId || !code) {
            return res.status(400).json({ ok: false, error: 'deviceId y codigo son requeridos.' });
        }

        try {
            const verified = await resolvedDeviceAuthService.verifyOtp(deviceId, code);
            const wasRevoked = Boolean(verified?.device?.revokedAt);
            const approvedDevice = await resolvedDeviceAuthService.approveDevice(deviceId, deviceName, wasRevoked ? 'otp_reauth' : 'otp');
            setDeviceCookie(res, deviceId);
            const session = await authService.issueSessionForDevice({
                userId: verified.userId,
                tenantId: verified.tenantId,
                deviceId
            });
            setRefreshCookie(res, session?.refreshToken, session);

            await resolvedDeviceAuthService.notifyTenantOwnersDeviceApproved({
                tenantId: verified.tenantId,
                device: approvedDevice || verified.device,
                user: session.user
            }).catch(() => null);

            await auditLogService.writeAuditLog(session?.user?.tenantId || verified.tenantId || 'default', {
                userId: session?.user?.id || verified.userId || null,
                userEmail: session?.user?.email || null,
                role: session?.user?.role || 'seller',
                action: 'auth.device.otp_verified',
                resourceType: 'auth_device',
                resourceId: deviceId,
                source: 'api',
                ip: String(req.ip || ''),
                payload: { deviceName: approvedDevice?.deviceName || deviceName || null }
            });

            return res.json({ ok: true, ...stripRefreshToken(session) });
        } catch (error) {
            const reason = String(error?.message || 'otp_invalid');
            const status = /too_many|invalid|expired|required|not_found/i.test(reason) ? 400 : 500;
            return res.status(status).json({ ok: false, error: reason });
        }
    });

    app.post('/api/auth/resend-otp', async (req, res) => {
        const deviceId = String(req.body?.deviceId || getDeviceIdFromRequest(req) || '').trim();
        if (!deviceId) {
            return res.status(400).json({ ok: false, error: 'deviceId es requerido.' });
        }

        try {
            const result = await resolvedDeviceAuthService.resendOtp({
                deviceId,
                ipAddress: String(req.ip || '').trim()
            });
            return res.json({
                ok: true,
                message: 'OTP reenviado',
                expiresInSec: result?.expiresInSec || 600
            });
        } catch (error) {
            const reason = String(error?.message || 'No se pudo reenviar OTP.');
            const status = /limited|not_found/i.test(reason) ? 429 : 400;
            return res.status(status).json({ ok: false, error: reason });
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
            const refreshToken = getRefreshTokenFromRequest(req);
            if (!refreshToken) {
                return res.status(401).json({ ok: false, error: 'refresh token requerido.' });
            }
            const deviceId = getDeviceIdFromRequest(req);
            if (deviceId && await resolvedDeviceAuthService.isDeviceRevoked(deviceId)) {
                return res.status(401).json({ ok: false, error: 'device_revoked' });
            }

            const session = await authService.refreshSession({ refreshToken, deviceId });
            setRefreshCookie(res, session?.refreshToken, session);
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

            return res.json({ ok: true, ...stripRefreshToken(session) });
        } catch (error) {
            const message = String(error?.message || 'No se pudo renovar sesion.');
            return res.status(401).json({ ok: false, error: message });
        }
    });

    app.patch('/api/auth/session/activity', async (req, res) => {
        try {
            const authContext = req.authContext || { isAuthenticated: false, user: null };
            if (authService.isAuthEnabled() && (!authContext.isAuthenticated || !authContext.user)) {
                return res.status(401).json({ ok: false, error: 'No autenticado.' });
            }
            const deviceId = getDeviceIdFromRequest(req);
            if (!deviceId) {
                return res.status(400).json({ ok: false, error: 'device_id requerido.' });
            }
            if (await resolvedDeviceAuthService.isDeviceRevoked(deviceId)) {
                return res.status(401).json({ ok: false, error: 'device_revoked' });
            }
            await resolvedDeviceAuthService.updateLastActivity(deviceId, {
                ipAddress: String(req.ip || '').trim()
            });
            return res.json({ ok: true });
        } catch (error) {
            const message = String(error?.message || 'No se pudo actualizar actividad.');
            const status = /revoked|device/i.test(message) ? 401 : 500;
            return res.status(status).json({ ok: false, error: message });
        }
    });

    app.post('/api/auth/switch-tenant', async (req, res) => {
        try {
            const authContext = req.authContext || { isAuthenticated: false, user: null };
            if (authService.isAuthEnabled() && (!authContext.isAuthenticated || !authContext.user)) {
                return res.status(401).json({ ok: false, error: 'No autenticado.' });
            }

            const accessToken = String(authService.getTokenFromRequest(req) || req.body?.accessToken || '').trim();
            const refreshToken = getRefreshTokenFromRequest(req);
            const deviceId = getDeviceIdFromRequest(req);
            const targetTenantId = String(req.body?.targetTenantId || '').trim();

            if (!targetTenantId) {
                return res.status(400).json({ ok: false, error: 'targetTenantId es requerido.' });
            }

            const session = await authService.switchTenantSession({
                accessToken,
                refreshToken,
                targetTenantId,
                deviceId
            });
            setRefreshCookie(res, session?.refreshToken, session);

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

            return res.json({ ok: true, ...stripRefreshToken(session) });
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
            const refreshToken = getRefreshTokenFromRequest(req);

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
            clearRefreshCookie(res);

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

    app.get('/api/auth/devices', async (req, res) => {
        const userId = getAuthenticatedUserId(req);
        if (!userId) {
            return res.status(401).json({ ok: false, error: 'No autenticado.' });
        }
        if (!hasDevicePermission(req, resolvedAccessPolicyService.PERMISSIONS.DEVICES_VIEW_OWN)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const devices = await resolvedDeviceAuthService.listDevicesForUser(userId, {
                currentDeviceId: getDeviceIdFromRequest(req)
            });
            return res.json({ ok: true, devices });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron listar dispositivos.') });
        }
    });

    app.patch('/api/auth/devices/:deviceId', async (req, res) => {
        const userId = getAuthenticatedUserId(req);
        const deviceId = String(req.params?.deviceId || '').trim();
        const deviceName = String(req.body?.deviceName || '').trim();
        if (!userId) {
            return res.status(401).json({ ok: false, error: 'No autenticado.' });
        }
        if (!deviceId || !deviceName) {
            return res.status(400).json({ ok: false, error: 'deviceId y deviceName son requeridos.' });
        }
        if (!hasDevicePermission(req, resolvedAccessPolicyService.PERMISSIONS.DEVICES_VIEW_OWN)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const device = await resolvedDeviceAuthService.renameDevice({ userId, deviceId, deviceName });
            await auditLogService.writeAuditLog(req?.tenantContext?.id || req?.authContext?.user?.tenantId || 'default', {
                userId,
                userEmail: req?.authContext?.user?.email || null,
                role: req?.authContext?.user?.role || 'seller',
                action: 'auth.device.rename',
                resourceType: 'auth_device',
                resourceId: deviceId,
                source: 'api',
                ip: String(req.ip || ''),
                payload: { deviceName }
            });
            return res.json({ ok: true, device });
        } catch (error) {
            const reason = String(error?.message || 'No se pudo actualizar el dispositivo.');
            const status = /required|not_found/i.test(reason) ? 400 : 500;
            return res.status(status).json({ ok: false, error: reason });
        }
    });

    app.delete('/api/auth/devices/:deviceId', async (req, res) => {
        const userId = getAuthenticatedUserId(req);
        const deviceId = String(req.params?.deviceId || '').trim();
        if (!userId) {
            return res.status(401).json({ ok: false, error: 'No autenticado.' });
        }
        if (!deviceId) {
            return res.status(400).json({ ok: false, error: 'deviceId es requerido.' });
        }
        if (!hasDevicePermission(req, resolvedAccessPolicyService.PERMISSIONS.DEVICES_REVOKE_OWN)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const device = await resolvedDeviceAuthService.revokeDevice({
                actorUserId: userId,
                deviceId,
                currentDeviceId: getDeviceIdFromRequest(req),
                allowAny: canRevokeAnyUserDevice(req)
            });
            await auditLogService.writeAuditLog(device?.tenantId || req?.tenantContext?.id || req?.authContext?.user?.tenantId || 'default', {
                userId,
                userEmail: req?.authContext?.user?.email || null,
                role: req?.authContext?.user?.role || 'seller',
                action: 'auth.device.revoke',
                resourceType: 'auth_device',
                resourceId: deviceId,
                source: 'api',
                ip: String(req.ip || ''),
                payload: { targetUserId: device?.userId || null }
            });
            return res.json({ ok: true, device });
        } catch (error) {
            const reason = String(error?.message || 'No se pudo revocar el dispositivo.');
            const status = /current|not_found/i.test(reason) ? 400 : 500;
            return res.status(status).json({ ok: false, error: reason });
        }
    });

    app.post('/api/auth/devices/:deviceId/request-reauthorization', async (req, res) => {
        const userId = getAuthenticatedUserId(req);
        const deviceId = String(req.params?.deviceId || '').trim();
        if (!userId) {
            return res.status(401).json({ ok: false, error: 'No autenticado.' });
        }
        if (!deviceId) {
            return res.status(400).json({ ok: false, error: 'deviceId es requerido.' });
        }
        if (!hasDevicePermission(req, resolvedAccessPolicyService.PERMISSIONS.DEVICES_REVOKE_OWN)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const result = await resolvedDeviceAuthService.requestDeviceReauthorization({
                actorUserId: userId,
                deviceId,
                ipAddress: String(req.ip || '').trim(),
                allowAny: canRevokeAnyUserDevice(req)
            });
            await auditLogService.writeAuditLog(result?.device?.tenantId || req?.tenantContext?.id || req?.authContext?.user?.tenantId || 'default', {
                userId,
                userEmail: req?.authContext?.user?.email || null,
                role: req?.authContext?.user?.role || 'seller',
                action: 'auth.device.reauthorization_requested',
                resourceType: 'auth_device',
                resourceId: deviceId,
                source: 'api',
                ip: String(req.ip || ''),
                payload: { targetUserId: result?.device?.userId || null }
            });
            return res.json({
                ok: true,
                message: 'OTP enviado a los autorizadores de acceso.',
                expiresInSec: result?.expiresInSec || 600
            });
        } catch (error) {
            const reason = String(error?.message || 'No se pudo solicitar reautorizacion.');
            const status = /not_found|not_revoked|required/i.test(reason) ? 400 : 500;
            return res.status(status).json({ ok: false, error: reason });
        }
    });

    app.get('/api/admin/users/:userId/devices', async (req, res) => {
        if (!canManageUserDevices(req)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }
        const targetUserId = String(req.params?.userId || '').trim();
        if (!targetUserId) {
            return res.status(400).json({ ok: false, error: 'userId es requerido.' });
        }

        try {
            const devices = await resolvedDeviceAuthService.listDevicesForAdminUser(targetUserId, {
                currentDeviceId: getDeviceIdFromRequest(req)
            });
            return res.json({ ok: true, devices });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron listar dispositivos.') });
        }
    });

    app.delete('/api/admin/devices/:deviceId', async (req, res) => {
        const userId = getAuthenticatedUserId(req);
        const deviceId = String(req.params?.deviceId || '').trim();
        if (!userId) {
            return res.status(401).json({ ok: false, error: 'No autenticado.' });
        }
        if (!deviceId) {
            return res.status(400).json({ ok: false, error: 'deviceId es requerido.' });
        }
        if (!canRevokeAnyUserDevice(req)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const device = await resolvedDeviceAuthService.revokeDevice({
                actorUserId: userId,
                deviceId,
                currentDeviceId: getDeviceIdFromRequest(req),
                allowAny: true
            });
            await auditLogService.writeAuditLog(device?.tenantId || req?.tenantContext?.id || req?.authContext?.user?.tenantId || 'default', {
                userId,
                userEmail: req?.authContext?.user?.email || null,
                role: req?.authContext?.user?.role || 'seller',
                action: 'auth.device.admin_revoke',
                resourceType: 'auth_device',
                resourceId: deviceId,
                source: 'api',
                ip: String(req.ip || ''),
                payload: { targetUserId: device?.userId || null }
            });
            return res.json({ ok: true, device });
        } catch (error) {
            const reason = String(error?.message || 'No se pudo revocar el dispositivo.');
            const status = /current|not_found/i.test(reason) ? 400 : 500;
            return res.status(status).json({ ok: false, error: reason });
        }
    });

    app.post('/api/admin/devices/:deviceId/request-reauthorization', async (req, res) => {
        const userId = getAuthenticatedUserId(req);
        const deviceId = String(req.params?.deviceId || '').trim();
        if (!userId) {
            return res.status(401).json({ ok: false, error: 'No autenticado.' });
        }
        if (!deviceId) {
            return res.status(400).json({ ok: false, error: 'deviceId es requerido.' });
        }
        if (!canRevokeAnyUserDevice(req)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const result = await resolvedDeviceAuthService.requestDeviceReauthorization({
                actorUserId: userId,
                deviceId,
                ipAddress: String(req.ip || '').trim(),
                allowAny: true
            });
            await auditLogService.writeAuditLog(result?.device?.tenantId || req?.tenantContext?.id || req?.authContext?.user?.tenantId || 'default', {
                userId,
                userEmail: req?.authContext?.user?.email || null,
                role: req?.authContext?.user?.role || 'seller',
                action: 'auth.device.admin_reauthorization_requested',
                resourceType: 'auth_device',
                resourceId: deviceId,
                source: 'api',
                ip: String(req.ip || ''),
                payload: { targetUserId: result?.device?.userId || null }
            });
            return res.json({
                ok: true,
                message: 'OTP enviado a los autorizadores de acceso.',
                expiresInSec: result?.expiresInSec || 600
            });
        } catch (error) {
            const reason = String(error?.message || 'No se pudo solicitar reautorizacion.');
            const status = /not_found|not_revoked|required/i.test(reason) ? 400 : 500;
            return res.status(status).json({ ok: false, error: reason });
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

