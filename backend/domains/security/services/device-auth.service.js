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
        createdAt: row.created_at || row.createdAt || null
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
                    last_seen_at = NOW()
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
            user_agent, ip_address, is_approved, last_seen_at, created_at
        ) VALUES (
            $1, $2, $3, NULL, $4,
            $5, $6, FALSE, NOW(), NOW()
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
    const recipient = safeUser.email;
    if (!recipient) throw new Error('Correo del usuario requerido para enviar OTP.');

    if (!emailService.isEmailConfigured()) {
        if (isProduction()) {
            throw new Error('SMTP no configurado para enviar OTP.');
        }
        return { skipped: 'smtp_not_configured' };
    }

    const deviceType = text(device.deviceType || device.device_type) || 'desktop';
    const ip = text(ipAddress || device.ipAddress || device.ip_address) || 'IP no disponible';
    const subject = 'Codigo de verificacion - Panel de control';
    const textBody = [
        `Hola ${safeUser.name || safeUser.email},`,
        '',
        'Se detecto un acceso desde un nuevo dispositivo:',
        `Dispositivo: ${deviceType} · ${ip}`,
        `Codigo de verificacion: ${code}`,
        `Valido por ${OTP_TTL_MINUTES} minutos.`,
        '',
        'Si no fuiste tu, ignora este mensaje.'
    ].join('\n');
    const htmlBody = `
        <p>Hola ${safeUser.name || safeUser.email},</p>
        <p>Se detecto un acceso desde un nuevo dispositivo:</p>
        <p><strong>Dispositivo:</strong> ${deviceType} &middot; ${ip}</p>
        <p style="font-size:24px;letter-spacing:4px;"><strong>${code}</strong></p>
        <p>Valido por ${OTP_TTL_MINUTES} minutos.</p>
        <p>Si no fuiste tu, ignora este mensaje.</p>
    `;
    return emailService.sendEmail({ to: recipient, subject, text: textBody, html: htmlBody });
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
                last_seen_at = NOW()
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
        debugCode: !isProduction() && emailResult?.skipped ? otp.code : undefined
    };
}

async function notifyTenantOwnersDeviceApproved({ tenantId = '', device = {}, user = {} } = {}) {
    if (!isPostgresAvailable() || !emailService.isEmailConfigured()) return { skipped: true };
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
    await Promise.allSettled(recipients.map((to) => emailService.sendEmail({ to, subject, text: body })));
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
    getDeviceSession
};
