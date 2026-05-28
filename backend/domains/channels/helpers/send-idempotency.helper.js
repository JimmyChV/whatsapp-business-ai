const {
    getStorageDriver,
    getPostgresPool,
    normalizeTenantId
} = require('../../../config/persistence-runtime');

const ADVISORY_LOCK_MAX = 2147483647;

function toText(value = '') {
    return String(value ?? '').trim();
}

function normalizeChatId(chatId = '') {
    return toText(chatId);
}

function normalizeFingerprint(value = '') {
    const text = toText(value);
    return text || 'unknown';
}

function currentSendBucket(now = Date.now()) {
    return Math.floor(Number(now || Date.now()) / 30000);
}

function buildSendFingerprintKey({
    tenantId = '',
    chatId = '',
    type = '',
    fingerprint = '',
    bucket = currentSendBucket()
} = {}) {
    const safeTenantId = normalizeTenantId(tenantId || '');
    const safeChatId = normalizeChatId(chatId);
    const safeType = toText(type).toLowerCase() || 'unknown';
    const safeFingerprint = normalizeFingerprint(fingerprint);
    const safeBucket = Number.isFinite(Number(bucket)) ? Math.floor(Number(bucket)) : currentSendBucket();
    return `${safeTenantId}:${safeChatId}:${safeType}:${safeFingerprint}:${safeBucket}`;
}

function hashToInt53(value = '') {
    const input = String(value || '');
    let hash = 5381;
    for (let index = 0; index < input.length; index += 1) {
        hash = ((hash * 33) + input.charCodeAt(index)) % ADVISORY_LOCK_MAX;
    }
    const normalized = Math.abs(hash) % ADVISORY_LOCK_MAX;
    return normalized || 1;
}

async function withSendIdempotency({
    tenantId = '',
    chatId = '',
    type = '',
    fingerprint = '',
    bucket = currentSendBucket(),
    fn
} = {}) {
    if (typeof fn !== 'function') {
        throw new Error('withSendIdempotency requiere una funcion fn.');
    }

    console.log('[Idempotency] attempting lock', {
        tenantId,
        chatId,
        type,
        fingerprint
    });

    const safeTenantId = normalizeTenantId(tenantId || '');
    const safeChatId = normalizeChatId(chatId);
    const safeType = toText(type).toLowerCase();
    const safeFingerprint = normalizeFingerprint(fingerprint);

    if (getStorageDriver() !== 'postgres' || !safeTenantId || !safeChatId || !safeType) {
        return await fn();
    }

    const keyStr = buildSendFingerprintKey({
        tenantId: safeTenantId,
        chatId: safeChatId,
        type: safeType,
        fingerprint: safeFingerprint,
        bucket
    });
    const lockKey = hashToInt53(keyStr);
    const client = await getPostgresPool().connect();

    try {
        const lockResult = await client.query(
            'SELECT pg_try_advisory_lock($1) AS acquired',
            [lockKey]
        );
        if (!lockResult?.rows?.[0]?.acquired) {
            return null;
        }

        const existing = await client.query(
            `SELECT message_id
               FROM tenant_messages
              WHERE tenant_id = $1
                AND chat_id = $2
                AND metadata->>'sendFingerprint' = $3
                AND created_at > NOW() - INTERVAL '30 seconds'
              LIMIT 1`,
            [safeTenantId, safeChatId, keyStr]
        );
        if (Array.isArray(existing?.rows) && existing.rows.length > 0) {
            return null;
        }

        return await fn();
    } finally {
        await client.query('SELECT pg_advisory_unlock($1)', [lockKey]).catch(() => { });
        client.release();
    }
}

module.exports = {
    buildSendFingerprintKey,
    currentSendBucket,
    hashToInt53,
    withSendIdempotency
};
