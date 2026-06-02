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
    const fs = require('fs');
    const path = require('path');
    const crypto = require('crypto');
    const multer = require('multer');
    const passwordHashService = require('../services/password-hash.service');
    const authSessionService = require('../services/auth-session.service');
    const emailService = require('../services/email.service');
    const refreshCookieName = 'saas_refresh_token';
    const deviceCookieName = 'saas_device_id';
    const loginAttemptWindowMinutes = 15;
    const loginAttemptMaxFailures = 5;
    const loginAttemptRetryAfterSec = loginAttemptWindowMinutes * 60;
    const avatarUpload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 2 * 1024 * 1024 },
        fileFilter: (req, file, cb) => {
            const mime = String(file?.mimetype || '').trim().toLowerCase();
            if (['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
                cb(null, true);
                return;
            }
            cb(new Error('avatar_invalid_type'));
        }
    });

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

    function cleanText(value = '', max = 160) {
        return String(value ?? '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, max);
    }

    function getCurrentTenantId(req = {}) {
        const user = getAuthenticatedUser(req);
        return String(user?.tenantId || req?.tenantContext?.id || 'default').trim() || 'default';
    }

    function getCurrentUserRole(req = {}) {
        const user = getAuthenticatedUser(req);
        if (user?.isSuperAdmin === true) return 'superadmin';
        return String(user?.role || 'seller').trim().toLowerCase() || 'seller';
    }

    function getActorDisplayName(req = {}) {
        const user = getAuthenticatedUser(req);
        return cleanText(user?.displayName || user?.name || user?.email || user?.userId || user?.id || 'Administrador', 140);
    }

    function getDeviceDisplayNameForAudit(device = {}) {
        return cleanText(device?.deviceName || device?.deviceType || device?.deviceId || 'Dispositivo', 140);
    }

    function buildDeviceRevocationAuditPayload(device = {}, actorUserId = '', req = {}) {
        const deviceName = getDeviceDisplayNameForAudit(device);
        const cleanActorId = String(actorUserId || '').trim();
        const ownerId = String(device?.userId || '').trim();
        if (cleanActorId && ownerId && cleanActorId === ownerId) {
            return { revokedBy: 'self', deviceName };
        }
        return {
            revokedBy: 'admin',
            adminName: getActorDisplayName(req),
            deviceName,
            deviceOwner: cleanText(device?.userName || device?.userEmail || device?.userId || '', 160) || null
        };
    }

    function buildDeviceReauthAuditPayload(device = {}, req = {}) {
        return {
            adminName: getActorDisplayName(req),
            deviceName: getDeviceDisplayNameForAudit(device),
            deviceOwner: cleanText(device?.userName || device?.userEmail || device?.userId || '', 160) || null,
            targetUserId: device?.userId || null
        };
    }

    function toPublicProfile(row = {}, fallbackUser = {}) {
        const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
        const displayName = cleanText(row?.display_name || fallbackUser?.name || fallbackUser?.email || 'Usuario', 140);
        return {
            userId: String(row?.user_id || fallbackUser?.userId || fallbackUser?.id || '').trim(),
            email: String(row?.email || fallbackUser?.email || '').trim(),
            displayName,
            role: String(row?.role || fallbackUser?.role || 'seller').trim().toLowerCase(),
            tenantName: String(row?.tenant_name || fallbackUser?.tenantName || '').trim(),
            avatarUrl: String(row?.avatar_url || fallbackUser?.avatarUrl || '').trim(),
            phone: cleanText(metadata.phone || metadata.phoneNumber || '', 40),
            createdAt: row?.created_at ? new Date(row.created_at).toISOString() : null,
            passwordChangedAt: row?.password_changed_at ? new Date(row.password_changed_at).toISOString() : null
        };
    }

    let passwordChangedAtColumnAvailable = null;
    async function hasPasswordChangedAtColumn() {
        if (passwordChangedAtColumnAvailable !== null) return passwordChangedAtColumnAvailable;
        try {
            const { rows } = await queryPostgres(
                `SELECT 1
                   FROM information_schema.columns
                  WHERE table_schema = 'public'
                    AND table_name = 'users'
                    AND column_name = 'password_changed_at'
                  LIMIT 1`
            );
            passwordChangedAtColumnAvailable = Boolean(rows?.[0]);
        } catch (_) {
            passwordChangedAtColumnAvailable = false;
        }
        return passwordChangedAtColumnAvailable;
    }

    async function fetchUserProfile(req = {}) {
        const user = getAuthenticatedUser(req);
        const userId = String(user?.userId || user?.id || '').trim();
        const tenantId = getCurrentTenantId(req);
        if (!userId) throw new Error('No autenticado.');
        const includePasswordChangedAt = await hasPasswordChangedAtColumn();
        const { rows } = await queryPostgres(
            `SELECT u.user_id, u.email, u.display_name, u.avatar_url, u.metadata, u.created_at,
                    ${includePasswordChangedAt ? 'u.password_changed_at' : 'NULL::timestamptz AS password_changed_at'},
                    m.role, t.name AS tenant_name
               FROM users u
               LEFT JOIN memberships m
                 ON m.user_id = u.user_id
                AND m.tenant_id = $2
                AND m.is_active = true
               LEFT JOIN tenants t
                 ON t.tenant_id = $2
              WHERE u.user_id = $1
              LIMIT 1`,
            [userId, tenantId]
        );
        if (!rows?.[0]) throw new Error('Usuario no encontrado.');
        return toPublicProfile(rows[0], user);
    }

    async function getUserPasswordHash(userId = '') {
        const { rows } = await queryPostgres(
            `SELECT user_id, email, display_name, password_hash
               FROM users
              WHERE user_id = $1
              LIMIT 1`,
            [String(userId || '').trim()]
        );
        return rows?.[0] || null;
    }

    function validateNewPassword(currentPassword = '', newPassword = '', confirmPassword = '') {
        const password = String(newPassword || '');
        const errors = [];
        if (password.length < 8) errors.push('min_length');
        if (!/\d/.test(password)) errors.push('number');
        if (!/[A-Z]/.test(password)) errors.push('uppercase');
        if (confirmPassword && password !== String(confirmPassword || '')) errors.push('match');
        if (String(currentPassword || '') && password === String(currentPassword || '')) errors.push('different');
        return errors;
    }

    function getAvatarExtension(mime = '') {
        const clean = String(mime || '').trim().toLowerCase();
        if (clean === 'image/png') return 'png';
        if (clean === 'image/webp') return 'webp';
        return 'jpg';
    }

    function getUploadsRoot() {
        return path.resolve(String(process.env.SAAS_UPLOADS_DIR || path.join(__dirname, '../../../..', 'uploads')));
    }

    async function saveAvatarFile(userId = '', file = null) {
        if (!file?.buffer?.length) throw new Error('avatar_required');
        const extension = getAvatarExtension(file.mimetype);
        const fileName = `${String(userId || 'user').replace(/[^a-zA-Z0-9_-]/g, '')}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${extension}`;
        const avatarsDir = path.join(getUploadsRoot(), 'avatars');
        await fs.promises.mkdir(avatarsDir, { recursive: true });
        await fs.promises.writeFile(path.join(avatarsDir, fileName), file.buffer);
        return `/uploads/avatars/${fileName}`;
    }

    async function getPasswordNoticeRecipients(tenantId = '') {
        const recipients = new Set();
        try {
            const authorizers = await queryPostgres(
                `SELECT email
                   FROM tenant_device_authorizers
                  WHERE tenant_id = $1
                    AND is_active = true
                  ORDER BY created_at ASC
                  LIMIT 5`,
                [tenantId]
            );
            for (const row of authorizers.rows || []) {
                const email = String(row?.email || '').trim().toLowerCase();
                if (email) recipients.add(email);
            }
        } catch (_) {}

        if (recipients.size === 0) {
            try {
                const owners = await queryPostgres(
                    `SELECT u.email
                       FROM memberships m
                       JOIN users u ON u.user_id = m.user_id
                      WHERE m.tenant_id = $1
                        AND m.role = 'owner'
                        AND m.is_active = true
                        AND u.is_active = true`,
                    [tenantId]
                );
                for (const row of owners.rows || []) {
                    const email = String(row?.email || '').trim().toLowerCase();
                    if (email) recipients.add(email);
                }
            } catch (_) {}
        }
        return Array.from(recipients);
    }

    async function sendPasswordChangedEmails({ tenantId, profile, req, notifyAuthorizers = false } = {}) {
        const ip = getClientIp(req);
        const changedAt = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' });
        await emailService.sendEmailForTenant(tenantId, {
            to: profile.email,
            subject: 'Tu contraseña fue cambiada - Panel WhatsApp SaaS',
            text: `Hola ${profile.displayName},\n\nTu contraseña fue cambiada exitosamente.\nFecha: ${changedAt}\nIP: ${ip}\n\nSi no fuiste tú, contacta al administrador inmediatamente.`,
            html: `
                <p>Hola <strong>${profile.displayName}</strong>,</p>
                <p>Tu contraseña fue cambiada exitosamente.</p>
                <p><strong>Fecha:</strong> ${changedAt}<br/><strong>IP:</strong> ${ip}</p>
                <p>Si no fuiste tú, contacta al administrador inmediatamente.</p>
            `,
            templateKey: 'password_changed',
            variables: {
                nombre: profile.displayName,
                fecha: changedAt,
                ip
            }
        }).catch((error) => {
            console.warn('[Auth] password changed email failed:', String(error?.message || error));
        });

        if (!notifyAuthorizers) return;
        const recipients = await getPasswordNoticeRecipients(tenantId);
        for (const email of recipients.filter((entry) => entry !== String(profile.email || '').trim().toLowerCase())) {
            await emailService.sendEmailForTenant(tenantId, {
                to: email,
                subject: 'Aviso: un usuario cambió su contraseña',
                text: `Aviso: ${profile.displayName} (${profile.email}) cambió su contraseña.\nFecha: ${changedAt}\nIP: ${ip}`,
                html: `
                    <p>Aviso: <strong>${profile.displayName}</strong> (${profile.email}) cambió su contraseña.</p>
                    <p><strong>Fecha:</strong> ${changedAt}<br/><strong>IP:</strong> ${ip}</p>
                `,
                templateKey: 'password_changed',
                variables: {
                    nombre: `${profile.displayName} (${profile.email})`,
                    fecha: changedAt,
                    ip
                }
            }).catch((error) => {
                console.warn('[Auth] authorizer password notice failed:', String(error?.message || error));
            });
        }
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

            if (!wasRevoked) {
                await resolvedDeviceAuthService.notifyTenantOwnersDeviceApproved({
                    tenantId: verified.tenantId,
                    device: approvedDevice || verified.device,
                    user: session.user
                }).catch(() => null);
            }

            await auditLogService.writeAuditLog(session?.user?.tenantId || verified.tenantId || 'default', {
                userId: session?.user?.id || verified.userId || null,
                userEmail: session?.user?.email || null,
                role: session?.user?.role || 'seller',
                action: wasRevoked ? 'auth.device.reauthorized' : 'auth.device.otp_verified',
                resourceType: 'auth_device',
                resourceId: deviceId,
                source: 'api',
                ip: String(req.ip || ''),
                payload: {
                    deviceName: approvedDevice?.deviceName || deviceName || null,
                    reauthorized: wasRevoked
                }
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
            await auditLogService.writeRequestAuditLog(req, {
                tenantId: result?.tenantId || null,
                action: 'auth.otp.resent',
                resourceType: 'auth_device',
                resourceId: deviceId,
                newValue: {
                    expiresInSec: result?.expiresInSec || 600
                }
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

    app.get('/api/auth/profile', async (req, res) => {
        const userId = getAuthenticatedUserId(req);
        if (!userId) {
            return res.status(401).json({ ok: false, error: 'No autenticado.' });
        }

        try {
            const profile = await fetchUserProfile(req);
            return res.json({ ok: true, profile });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo cargar el perfil.') });
        }
    });

    app.patch('/api/auth/profile', async (req, res) => {
        const userId = getAuthenticatedUserId(req);
        if (!userId) {
            return res.status(401).json({ ok: false, error: 'No autenticado.' });
        }

        const displayName = cleanText(req.body?.displayName, 140);
        const phone = cleanText(req.body?.phone, 40);
        if (!displayName) {
            return res.status(400).json({ ok: false, error: 'Nombre para mostrar requerido.' });
        }

        try {
            await queryPostgres(
                `UPDATE users
                    SET display_name = $2,
                        metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{phone}', to_jsonb($3::text), true),
                        updated_at = NOW()
                  WHERE user_id = $1`,
                [userId, displayName, phone]
            );

            const profile = await fetchUserProfile(req);
            await auditLogService.writeAuditLog(getCurrentTenantId(req), {
                userId,
                userEmail: profile.email,
                role: getCurrentUserRole(req),
                action: 'auth.profile.updated',
                resourceType: 'auth_profile',
                resourceId: userId,
                source: 'api',
                ip: String(req.ip || ''),
                payload: { displayName, hasPhone: Boolean(phone) }
            });
            return res.json({ ok: true, profile });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo actualizar el perfil.') });
        }
    });

    app.post('/api/auth/profile/avatar', avatarUpload.single('avatar'), async (req, res) => {
        const userId = getAuthenticatedUserId(req);
        if (!userId) {
            return res.status(401).json({ ok: false, error: 'No autenticado.' });
        }
        if (!req.file) {
            return res.status(400).json({ ok: false, error: 'Imagen requerida.' });
        }

        try {
            const avatarUrl = await saveAvatarFile(userId, req.file);
            await queryPostgres(
                `UPDATE users
                    SET avatar_url = $2,
                        updated_at = NOW()
                  WHERE user_id = $1`,
                [userId, avatarUrl]
            );
            const profile = await fetchUserProfile(req);
            await auditLogService.writeAuditLog(getCurrentTenantId(req), {
                userId,
                userEmail: profile.email,
                role: getCurrentUserRole(req),
                action: 'auth.profile.avatar_updated',
                resourceType: 'auth_profile',
                resourceId: userId,
                source: 'api',
                ip: String(req.ip || ''),
                payload: { avatarUrl }
            });
            return res.json({ ok: true, avatarUrl, profile });
        } catch (error) {
            const reason = String(error?.message || 'No se pudo subir la foto.');
            const status = /avatar_invalid_type|required|file too large/i.test(reason) ? 400 : 500;
            return res.status(status).json({ ok: false, error: reason });
        }
    });

    app.post('/api/auth/change-password', async (req, res) => {
        const userId = getAuthenticatedUserId(req);
        if (!userId) {
            return res.status(401).json({ ok: false, error: 'No autenticado.' });
        }

        const currentPassword = String(req.body?.currentPassword || '');
        const newPassword = String(req.body?.newPassword || '');
        const confirmPassword = String(req.body?.confirmPassword || newPassword || '');
        const validationErrors = validateNewPassword(currentPassword, newPassword, confirmPassword);
        if (validationErrors.length > 0) {
            return res.status(400).json({ ok: false, error: 'password_policy_failed', details: validationErrors });
        }

        try {
            const profile = await fetchUserProfile(req);
            const userRecord = await getUserPasswordHash(userId);
            if (!userRecord || !passwordHashService.verifyPassword(currentPassword, userRecord.password_hash)) {
                return res.status(400).json({ ok: false, error: 'invalid_current_password' });
            }

            const nextHash = passwordHashService.hashPassword(newPassword);
            if (await hasPasswordChangedAtColumn()) {
                await queryPostgres(
                    `UPDATE users
                        SET password_hash = $2,
                            password_changed_at = NOW(),
                            updated_at = NOW()
                      WHERE user_id = $1`,
                    [userId, nextHash]
                );
            } else {
                await queryPostgres(
                    `UPDATE users
                        SET password_hash = $2,
                            updated_at = NOW()
                      WHERE user_id = $1`,
                    [userId, nextHash]
                );
            }

            const revokedSessions = await authSessionService.revokeUserRefreshSessionsExcept({
                userId,
                email: profile.email,
                currentRefreshToken: getRefreshTokenFromRequest(req),
                reason: 'password_changed'
            });

            const isOwnerOrSuperAdmin = req?.authContext?.user?.isSuperAdmin === true || String(profile.role || '').toLowerCase() === 'owner';
            await sendPasswordChangedEmails({
                tenantId: getCurrentTenantId(req),
                profile,
                req,
                notifyAuthorizers: !isOwnerOrSuperAdmin
            });

            await auditLogService.writeAuditLog(getCurrentTenantId(req), {
                userId,
                userEmail: profile.email,
                role: getCurrentUserRole(req),
                action: 'auth.password.changed',
                resourceType: 'auth_profile',
                resourceId: userId,
                source: 'api',
                ip: String(req.ip || ''),
                payload: { revokedSessions: Number(revokedSessions?.updated || 0) || 0 }
            });

            return res.json({
                ok: true,
                message: 'Contraseña cambiada correctamente.',
                revokedSessions: Number(revokedSessions?.updated || 0) || 0
            });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo cambiar la contraseña.') });
        }
    });

    app.post('/api/auth/logout-all-devices', async (req, res) => {
        const userId = getAuthenticatedUserId(req);
        if (!userId) {
            return res.status(401).json({ ok: false, error: 'No autenticado.' });
        }

        try {
            const profile = await fetchUserProfile(req);
            const revokedSessions = await authSessionService.revokeUserRefreshSessionsGlobally({
                userId,
                email: profile.email,
                reason: 'logout_all_devices'
            });
            const { rowCount } = await queryPostgres(
                `UPDATE auth_device_sessions
                    SET revoked_at = NOW(),
                        revoked_by = $2
                  WHERE user_id = $1
                    AND revoked_at IS NULL
                    AND device_id <> $3`,
                [userId, userId, getDeviceIdFromRequest(req)]
            );

            clearRefreshCookie(res);
            await auditLogService.writeAuditLog(getCurrentTenantId(req), {
                userId,
                userEmail: profile.email,
                role: getCurrentUserRole(req),
                action: 'auth.logout.all_devices',
                resourceType: 'auth_profile',
                resourceId: userId,
                source: 'api',
                ip: String(req.ip || ''),
                payload: {
                    revokedSessions: Number(revokedSessions?.updated || 0) || 0,
                    revokedDevices: Number(rowCount || 0) || 0
                }
            });
            return res.json({
                ok: true,
                revokedSessions: Number(revokedSessions?.updated || 0) || 0,
                revokedDevices: Number(rowCount || 0) || 0
            });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo cerrar sesiones.') });
        }
    });

    app.get('/api/auth/devices', async (req, res) => {
        const userId = getAuthenticatedUserId(req);
        if (!userId) {
            return res.status(401).json({ ok: false, error: 'No autenticado.' });
        }
        if (!hasDevicePermission(req, resolvedAccessPolicyService.PERMISSIONS.DEVICES_VIEW_OWN) && !canManageUserDevices(req)) {
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
            const device = await resolvedDeviceAuthService.renameDevice({
                userId,
                deviceId,
                deviceName,
                allowAny: canManageUserDevices(req)
            });
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
                action: 'auth.device.revoked',
                resourceType: 'auth_device',
                resourceId: deviceId,
                source: 'api',
                ip: String(req.ip || ''),
                payload: buildDeviceRevocationAuditPayload(device, userId, req)
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
                action: 'auth.device.reauth_requested',
                resourceType: 'auth_device',
                resourceId: deviceId,
                source: 'api',
                ip: String(req.ip || ''),
                payload: buildDeviceReauthAuditPayload(result?.device, req)
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

    app.get('/api/admin/devices/all', async (req, res) => {
        if (!canManageUserDevices(req)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }
        const tenantId = getCurrentTenantId(req);
        try {
            const users = await resolvedDeviceAuthService.listDevicesGroupedByTenant(tenantId, {
                currentDeviceId: getDeviceIdFromRequest(req)
            });
            return res.json({ ok: true, users });
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
                action: 'auth.device.revoked',
                resourceType: 'auth_device',
                resourceId: deviceId,
                source: 'api',
                ip: String(req.ip || ''),
                payload: buildDeviceRevocationAuditPayload(device, userId, req)
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
                action: 'auth.device.reauth_requested',
                resourceType: 'auth_device',
                resourceId: deviceId,
                source: 'api',
                ip: String(req.ip || ''),
                payload: buildDeviceReauthAuditPayload(result?.device, req)
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

