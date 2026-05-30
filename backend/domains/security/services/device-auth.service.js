const crypto = require('crypto');
const {
    getStorageDriver,
    queryPostgres
} = require('../../../config/persistence-runtime');
const passwordHashService = require('./password-hash.service');
const emailService = require('./email.service');

const OTP_TTL_MINUTES = 10;
const OTP_RESEND_LIMIT_PER_HOUR = 3;
const LAST_SEEN_DEBOUNCE_MS = 5 * 60 * 1000;
const lastSeenCache = new Map();

function text(value = '') {
    return String(value || '').trim();
}

function lower(value = '') {
    return text(value).toLowerCase();
}

function isProduction() {
    return String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
}

function isPostgresAvailable() {
    return getStorageDriver() === 'postgres';
}

function detectDeviceType(userAgent = '') {
    const ua = text(userAgent);
    if (/ipad|tablet/i.test(ua)) return 'tablet';
    if (/mobile|android|iphone/i.test(ua)) return 'mobile';
    return 'desktop';
}

function generateDeviceId() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `dev_${crypto.randomBytes(16).toString('hex')}`;
}

function generateOtpCode() {
    return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function normalizeDeviceContext(context = {}) {
    const userAgent = text(context.userAgent);
    return {
        deviceId: text(context.deviceId),
        deviceName: text(context.deviceName),
        deviceType: text(context.deviceType) || detectDeviceType(userAgent),
        userAgent,
        ipAddress: text(context.ipAddress)
    };
}

function normalizeDeviceRow(row = null) {
    if (!row || typeof row !== 'object') return null;
    return {
        deviceId: text(row.device_id || row.deviceId),
        userId: text(row.user_id || row.userId),
        tenantId: text(row.tenant_id || row.tenantId),
        deviceName: text(row.device_name || row.deviceName),
        deviceType: text(row.device_type || row.deviceType),
        userAgent: text(row.user_agent || row.userAgent),
        ipAddress: text(row.ip_address || row.ipAddress),
        isApproved: row.is_approved === true || row.isApproved === true,
        approvedAt: row.approved_at || row.approvedAt || null,
        approvedBy: text(row.approved_by || row.approvedBy),
        revokedAt: row.revoked_at || row.revokedAt || null,
        lastSeenAt: row.last_seen_at || row.lastSeenAt || null,
        lastActivityAt: row.last_activity_at || row.lastActivityAt || null,
        createdAt: row.created_at || row.createdAt || null,
        userEmail: lower(row.user_email || row.userEmail),
        userName: text(row.user_name || row.userName)
    };
}

function normalizeUser(user = {}) {
    return {
        id: text(user.id || user.userId || user.user_id),
        email: lower(user.email),
        tenantId: text(user.tenantId || user.tenant_id || 'default'),
        name: text(user.name || user.displayName || user.fullName || user.email)
    };
}

function normalizeAuthorizerRow(row = null) {
    if (!row || typeof row !== 'object') return null;
    return {
        id: row.id,
        tenantId: text(row.tenant_id || row.tenantId),
        userId: text(row.user_id || row.userId),
        email: lower(row.email),
        name: text(row.name),
        isActive: row.is_active !== false && row.isActive !== false,
        createdAt: row.created_at || row.createdAt || null
    };
}

async function getDeviceAuthorizers(tenantId = '') {
    const cleanTenantId = text(tenantId);
    if (!cleanTenantId || !isPostgresAvailable()) return [];
    const { rows } = await queryPostgres(
        `SELECT id, tenant_id, user_id, email, name, is_active, created_at
           FROM tenant_device_authorizers
          WHERE tenant_id = $1
            AND is_active = TRUE
          ORDER BY created_at ASC NULLS LAST, id ASC`,
        [cleanTenantId]
    );
    return (rows || []).map(normalizeAuthorizerRow).filter((item) => item?.email);
}

async function getTenantOwnerEmail(tenantId = '') {
    const cleanTenantId = text(tenantId);
    if (!cleanTenantId || !isPostgresAvailable()) return '';
    const { rows } = await queryPostgres(
        `SELECT u.email
           FROM memberships m
           JOIN users u ON u.user_id = m.user_id
          WHERE m.tenant_id = $1
            AND m.role = 'owner'
            AND m.is_active = TRUE
            AND u.is_active = TRUE
          ORDER BY u.created_at ASC NULLS LAST
          LIMIT 1`,
        [cleanTenantId]
    );
    return lower(rows?.[0]?.email);
}

async function getDeviceSession(deviceId = '') {
    const cleanDeviceId = text(deviceId);
    if (!cleanDeviceId || !isPostgresAvailable()) return null;
    const { rows } = await queryPostgres(
        `SELECT *
           FROM auth_device_sessions
          WHERE device_id = $1
          LIMIT 1`,
        [cleanDeviceId]
    );
    return normalizeDeviceRow(rows?.[0] || null);
}

function withCurrentDevice(device = null, currentDeviceId = '') {
    if (!device) return null;
    const cleanCurrentId = text(currentDeviceId);
    return {
        ...device,
        current: Boolean(cleanCurrentId && device.deviceId === cleanCurrentId)
    };
}

async function listDevicesForUser(userId = '', { currentDeviceId = '' } = {}) {
    const cleanUserId = text(userId);
    if (!cleanUserId || !isPostgresAvailable()) return [];
    const { rows } = await queryPostgres(
        `SELECT d.*, u.email AS user_email, u.display_name AS user_name
           FROM auth_device_sessions d
           LEFT JOIN users u ON u.user_id = d.user_id
          WHERE d.user_id = $1
          ORDER BY COALESCE(d.last_seen_at, d.created_at) DESC NULLS LAST,
                   d.created_at DESC NULLS LAST`,
        [cleanUserId]
    );
    return (rows || []).map((row) => withCurrentDevice(normalizeDeviceRow(row), currentDeviceId)).filter(Boolean);
}

async function listDevicesForAdminUser(userId = '', { currentDeviceId = '' } = {}) {
    return listDevicesForUser(userId, { currentDeviceId });
}

async function renameDevice({ userId = '', deviceId = '', deviceName = '' } = {}) {
    const cleanUserId = text(userId);
    const cleanDeviceId = text(deviceId);
    const cleanName = text(deviceName);
    if (!cleanUserId || !cleanDeviceId) throw new Error('device_not_found');
    if (!cleanName) throw new Error('device_name_required');
    if (!isPostgresAvailable()) throw new Error('device_store_unavailable');

    const { rows } = await queryPostgres(
        `UPDATE auth_device_sessions
            SET device_name = $3
          WHERE device_id = $1
            AND user_id = $2
          RETURNING *`,
        [cleanDeviceId, cleanUserId, cleanName]
    );
    const device = normalizeDeviceRow(rows?.[0] || null);
    if (!device) throw new Error('device_not_found');
    return device;
}

async function revokeDevice({ actorUserId = '', deviceId = '', currentDeviceId = '', allowAny = false } = {}) {
    const cleanActorId = text(actorUserId);
    const cleanDeviceId = text(deviceId);
    const cleanCurrentId = text(currentDeviceId);
    if (!cleanActorId || !cleanDeviceId) throw new Error('device_not_found');
    if (cleanCurrentId && cleanDeviceId === cleanCurrentId) {
        throw new Error('cannot_revoke_current_device');
    }
    if (!isPostgresAvailable()) throw new Error('device_store_unavailable');

    const { rows } = await queryPostgres(
        `UPDATE auth_device_sessions
            SET revoked_at = COALESCE(revoked_at, NOW()),
                revoked_by = $2
          WHERE device_id = $1
            AND ($3::boolean = TRUE OR user_id = $2)
          RETURNING *`,
        [cleanDeviceId, cleanActorId, Boolean(allowAny)]
    );
    const device = normalizeDeviceRow(rows?.[0] || null);
    if (!device) throw new Error('device_not_found');
    return withCurrentDevice(device, currentDeviceId);
}

async function findDeviceWithUser(deviceId = '') {
    const cleanDeviceId = text(deviceId);
    if (!cleanDeviceId || !isPostgresAvailable()) return null;
    const { rows } = await queryPostgres(
        `SELECT d.*, u.email AS user_email, u.display_name AS user_name
           FROM auth_device_sessions d
           JOIN users u ON u.user_id = d.user_id
          WHERE d.device_id = $1
          LIMIT 1`,
        [cleanDeviceId]
    );
    const row = rows?.[0] || null;
    const device = normalizeDeviceRow(row);
    if (!device) return null;
    return {
        ...device,
        userEmail: lower(row.user_email),
        userName: text(row.user_name)
    };
}

async function upsertPendingDevice({ user = {}, deviceContext = {} } = {}) {
    if (!isPostgresAvailable()) return null;
    const safeUser = normalizeUser(user);
    const context = normalizeDeviceContext(deviceContext);
    if (!safeUser.id || !context.deviceId) return null;

    const existing = await getDeviceSession(context.deviceId);
    if (existing?.revokedAt) {
        throw new Error('device_revoked');
    }

    if (existing && existing.userId === safeUser.id && existing.isApproved) {
        await updateLastSeen(context.deviceId, { force: true, ipAddress: context.ipAddress });
        return { approved: true, device: existing };
    }

    if (existing) {
        await queryPostgres(
            `UPDATE auth_device_sessions
                SET user_id = $2,
                    tenant_id = $3,
                    device_type = $4,
                    user_agent = $5,
                    ip_address = $6,
                    is_approved = FALSE,
                    approved_at = NULL,
                    approved_by = NULL,
                    last_seen_at = NOW(),
                    last_activity_at = NOW()
              WHERE device_id = $1`,
            [
                context.deviceId,
                safeUser.id,
                safeUser.tenantId,
                context.deviceType,
                context.userAgent,
                context.ipAddress
            ]
        );
        return { approved: false, device: await getDeviceSession(context.deviceId) };
    }

    await queryPostgres(
        `INSERT INTO auth_device_sessions (
            device_id, user_id, tenant_id, device_name, device_type,
            user_agent, ip_address, is_approved, last_seen_at, last_activity_at, created_at
        ) VALUES (
            $1, $2, $3, NULL, $4,
            $5, $6, FALSE, NOW(), NOW(), NOW()
        )`,
        [
            context.deviceId,
            safeUser.id,
            safeUser.tenantId,
            context.deviceType,
            context.userAgent,
            context.ipAddress
        ]
    );
    return { approved: false, device: await getDeviceSession(context.deviceId) };
}

async function invalidateActiveOtps(deviceId = '') {
    const cleanDeviceId = text(deviceId);
    if (!cleanDeviceId || !isPostgresAvailable()) return;
    await queryPostgres(
        `UPDATE auth_otp_codes
            SET used_at = COALESCE(used_at, NOW())
          WHERE device_id = $1
            AND used_at IS NULL`,
        [cleanDeviceId]
    );
}

async function generateOtp(userId = '', deviceId = '') {
    const cleanUserId = text(userId);
    const cleanDeviceId = text(deviceId);
    if (!cleanUserId || !cleanDeviceId || !isPostgresAvailable()) {
        throw new Error('Datos de dispositivo invalidos.');
    }

    await invalidateActiveOtps(cleanDeviceId);
    const code = generateOtpCode();
    const codeHash = passwordHashService.hashPassword(code);
    const { rows } = await queryPostgres(
        `INSERT INTO auth_otp_codes (
            user_id, device_id, code_hash, expires_at, attempts, created_at
        ) VALUES (
            $1, $2, $3, NOW() + ($4 * INTERVAL '1 minute'), 0, NOW()
        )
        RETURNING otp_id, expires_at`,
        [cleanUserId, cleanDeviceId, codeHash, OTP_TTL_MINUTES]
    );
    return {
        code,
        otpId: text(rows?.[0]?.otp_id),
        expiresAt: rows?.[0]?.expires_at || null,
        expiresInSec: OTP_TTL_MINUTES * 60
    };
}

async function sendOtpEmail({ user = {}, device = {}, code = '', ipAddress = '' } = {}) {
    const safeUser = normalizeUser(user);
    const tenantId = safeUser.tenantId || text(device.tenantId || device.tenant_id);
    if (!tenantId) throw new Error('Tenant requerido para enviar OTP.');

    const authorizers = await getDeviceAuthorizers(tenantId);
    const ownerEmail = authorizers.length > 0 ? '' : await getTenantOwnerEmail(tenantId);
    const recipients = Array.from(new Set(
        (authorizers.length > 0 ? authorizers.map((item) => item.email) : [ownerEmail])
            .map(lower)
            .filter(Boolean)
    ));
    if (!recipients.length) {
        throw new Error('No hay autorizadores ni owner para enviar el codigo OTP.');
    }

    const deviceType = text(device.deviceType || device.device_type) || 'desktop';
    const ip = text(ipAddress || device.ipAddress || device.ip_address) || 'IP no disponible';
    const userName = safeUser.name || safeUser.email || safeUser.id || 'Usuario';
    const subject = 'Nuevo dispositivo requiere autorizacion';
    const textBody = [
        `El usuario ${userName} esta intentando acceder desde un nuevo dispositivo.`,
        `Dispositivo: ${deviceType} · ${ip}`,
        `Codigo OTP: ${code}`,
        '',
        'El autorizador debe compartir este codigo con el usuario para que pueda ingresar.',
        `Valido por ${OTP_TTL_MINUTES} minutos.`
    ].join('\n');
    const htmlBody = `
        <p>El usuario <strong>${userName}</strong> esta intentando acceder desde un nuevo dispositivo.</p>
        <p><strong>Dispositivo:</strong> ${deviceType} &middot; ${ip}</p>
        <p><strong>Codigo OTP:</strong>
          <span style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</span>
        </p>
        <p>El autorizador debe compartir este codigo con el usuario para que pueda ingresar.</p>
        <p>Valido por ${OTP_TTL_MINUTES} minutos.</p>
    `;
    const results = await Promise.allSettled(recipients.map((to) => emailService.sendEmailForTenant(tenantId, {
        to,
        subject,
        text: textBody,
        html: htmlBody
    })));
    const successful = results.filter((result) => result.status === 'fulfilled');
    if (!successful.length) {
        const reason = results.find((result) => result.status === 'rejected')?.reason;
        throw reason instanceof Error ? reason : new Error(String(reason || 'No se pudo enviar el codigo OTP.'));
    }
    const skipped = successful.find((result) => result.value?.skipped)?.value;
    if (skipped) return { ...skipped, recipients: recipients.length };
    return { ok: true, recipients: recipients.length };
}

async function ensureDeviceApprovedForLogin({ user = {}, deviceContext = {} } = {}) {
    const context = normalizeDeviceContext(deviceContext);
    if (!context.deviceId) return { approved: true };
    if (!isPostgresAvailable()) return { approved: true };

    const safeUser = normalizeUser(user);
    const status = await upsertPendingDevice({ user: safeUser, deviceContext: context });
    if (status?.approved) return { approved: true, device: status.device };

    const otp = await generateOtp(safeUser.id, context.deviceId);
    const device = status?.device || await getDeviceSession(context.deviceId);
    const emailResult = await sendOtpEmail({
        user: safeUser,
        device,
        code: otp.code,
        ipAddress: context.ipAddress
    });
    return {
        approved: false,
        requiresOtp: true,
        deviceId: context.deviceId,
        deviceType: context.deviceType,
        email: safeUser.email,
        otpDelivery: 'authorizers',
        expiresInSec: otp.expiresInSec,
        debugCode: !isProduction() && emailResult?.skipped ? otp.code : undefined
    };
}

async function verifyOtp(deviceId = '', codeInput = '') {
    const cleanDeviceId = text(deviceId);
    const cleanCode = text(codeInput).replace(/\D/g, '');
    if (!cleanDeviceId || !cleanCode) throw new Error('otp_required');
    if (!isPostgresAvailable()) throw new Error('otp_unavailable');

    const { rows } = await queryPostgres(
        `SELECT *
           FROM auth_otp_codes
          WHERE device_id = $1
            AND used_at IS NULL
          ORDER BY created_at DESC
          LIMIT 1`,
        [cleanDeviceId]
    );
    const otp = rows?.[0] || null;
    if (!otp) throw new Error('otp_expired');
    if (Number(otp.attempts || 0) >= 3) throw new Error('too_many_attempts');
    if (new Date(otp.expires_at).getTime() <= Date.now()) throw new Error('otp_expired');

    const ok = passwordHashService.verifyPassword(cleanCode, otp.code_hash);
    if (!ok) {
        await queryPostgres(
            `UPDATE auth_otp_codes
                SET attempts = attempts + 1
              WHERE otp_id = $1`,
            [otp.otp_id]
        );
        throw new Error('otp_invalid');
    }

    await queryPostgres(
        `UPDATE auth_otp_codes
            SET used_at = NOW()
          WHERE otp_id = $1`,
        [otp.otp_id]
    );
    const device = await getDeviceSession(cleanDeviceId);
    if (!device) throw new Error('device_not_found');
    return {
        userId: device.userId,
        tenantId: device.tenantId,
        device
    };
}

async function approveDevice(deviceId = '', deviceName = '', approvedBy = 'otp') {
    const cleanDeviceId = text(deviceId);
    if (!cleanDeviceId || !isPostgresAvailable()) return null;
    const safeName = text(deviceName) || 'Dispositivo verificado';
    const { rows } = await queryPostgres(
        `UPDATE auth_device_sessions
            SET is_approved = TRUE,
                approved_at = NOW(),
                approved_by = $2,
                device_name = $3,
                last_seen_at = NOW(),
                last_activity_at = NOW()
          WHERE device_id = $1
          RETURNING *`,
        [cleanDeviceId, text(approvedBy) || 'otp', safeName]
    );
    return normalizeDeviceRow(rows?.[0] || null);
}

async function resendOtp({ deviceId = '', ipAddress = '' } = {}) {
    const cleanDeviceId = text(deviceId);
    if (!cleanDeviceId || !isPostgresAvailable()) throw new Error('device_not_found');

    const { rows: countRows } = await queryPostgres(
        `SELECT COUNT(*)::int AS total
           FROM auth_otp_codes
          WHERE device_id = $1
            AND created_at > NOW() - INTERVAL '1 hour'`,
        [cleanDeviceId]
    );
    if (Number(countRows?.[0]?.total || 0) >= OTP_RESEND_LIMIT_PER_HOUR + 1) {
        throw new Error('otp_resend_limited');
    }

    const device = await findDeviceWithUser(cleanDeviceId);
    if (!device || device.revokedAt) throw new Error('device_not_found');
    const otp = await generateOtp(device.userId, cleanDeviceId);
    const emailResult = await sendOtpEmail({
        user: { id: device.userId, email: device.userEmail, name: device.userName, tenantId: device.tenantId },
        device,
        code: otp.code,
        ipAddress
    });
    return {
        ok: true,
        expiresInSec: otp.expiresInSec,
        otpDelivery: 'authorizers',
        debugCode: !isProduction() && emailResult?.skipped ? otp.code : undefined
    };
}

async function notifyTenantOwnersDeviceApproved({ tenantId = '', device = {}, user = {} } = {}) {
    if (!isPostgresAvailable()) return { skipped: true };
    const cleanTenantId = text(tenantId);
    if (!cleanTenantId) return { skipped: true };
    const { rows } = await queryPostgres(
        `SELECT DISTINCT u.email, u.display_name
           FROM memberships m
           JOIN users u ON u.user_id = m.user_id
          WHERE m.tenant_id = $1
            AND m.role = 'owner'
            AND m.is_active = TRUE
            AND u.is_active = TRUE`,
        [cleanTenantId]
    );
    const recipients = (rows || []).map((row) => lower(row.email)).filter(Boolean);
    if (!recipients.length) return { skipped: true };
    const subject = 'Nuevo dispositivo aprobado';
    const body = [
        'Se aprobo un nuevo dispositivo para acceder al panel.',
        '',
        `Usuario: ${text(user.email || user.userEmail)}`,
        `Dispositivo: ${text(device.deviceName || device.device_name) || text(device.deviceType || device.device_type) || 'Sin nombre'}`,
        `IP: ${text(device.ipAddress || device.ip_address) || 'No disponible'}`
    ].join('\n');
    await Promise.allSettled(recipients.map((to) => emailService.sendEmailForTenant(cleanTenantId, { to, subject, text: body })));
    return { ok: true, count: recipients.length };
}

async function isDeviceRevoked(deviceId = '') {
    const device = await getDeviceSession(deviceId);
    return Boolean(device?.revokedAt);
}

async function updateLastSeen(deviceId = '', { force = false, ipAddress = '' } = {}) {
    const cleanDeviceId = text(deviceId);
    if (!cleanDeviceId || !isPostgresAvailable()) return { skipped: true };
    const now = Date.now();
    const last = Number(lastSeenCache.get(cleanDeviceId) || 0);
    if (!force && last && (now - last) < LAST_SEEN_DEBOUNCE_MS) return { skipped: true };
    lastSeenCache.set(cleanDeviceId, now);
    await queryPostgres(
        `UPDATE auth_device_sessions
            SET last_seen_at = NOW(),
                ip_address = COALESCE(NULLIF($2, ''), ip_address)
          WHERE device_id = $1
            AND revoked_at IS NULL`,
        [cleanDeviceId, text(ipAddress)]
    );
    return { ok: true };
}

async function updateLastActivity(deviceId = '', { ipAddress = '' } = {}) {
    const cleanDeviceId = text(deviceId);
    if (!cleanDeviceId || !isPostgresAvailable()) return { skipped: true };
    const { rows } = await queryPostgres(
        `UPDATE auth_device_sessions
            SET last_activity_at = NOW(),
                last_seen_at = NOW(),
                ip_address = COALESCE(NULLIF($2, ''), ip_address)
          WHERE device_id = $1
            AND revoked_at IS NULL
          RETURNING *`,
        [cleanDeviceId, text(ipAddress)]
    );
    const device = normalizeDeviceRow(rows?.[0] || null);
    if (!device) throw new Error('device_revoked');
    return { ok: true, device };
}

async function revokeInactiveDesktopSessions({ inactiveHours = 3 } = {}) {
    if (!isPostgresAvailable()) return { skipped: true, updated: 0 };
    const hours = Number(inactiveHours);
    const safeHours = Number.isFinite(hours) && hours > 0 ? hours : 3;
    const { rowCount } = await queryPostgres(
        `UPDATE auth_device_sessions
            SET revoked_at = NOW(),
                revoked_by = 'inactivity'
          WHERE device_type = 'desktop'
            AND revoked_at IS NULL
            AND COALESCE(last_activity_at, last_seen_at, created_at) < NOW() - ($1 * INTERVAL '1 hour')`,
        [safeHours]
    );
    return { ok: true, updated: Number(rowCount || 0) };
}

module.exports = {
    generateDeviceId,
    detectDeviceType,
    ensureDeviceApprovedForLogin,
    verifyOtp,
    approveDevice,
    resendOtp,
    notifyTenantOwnersDeviceApproved,
    isDeviceRevoked,
    updateLastSeen,
    updateLastActivity,
    revokeInactiveDesktopSessions,
    getDeviceSession,
    listDevicesForUser,
    listDevicesForAdminUser,
    renameDevice,
    revokeDevice
};
