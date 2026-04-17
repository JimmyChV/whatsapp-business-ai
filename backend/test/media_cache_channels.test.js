const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { URL } = require('url');

const { createMessageMediaAssetsHelpers } = require('../domains/channels/helpers/message-media-assets.helpers');
const cloudClient = require('../domains/channels/services/whatsapp-cloud-client.service');

test('message media assets helper reuses processed catalog media from in-memory cache', async () => {
    const processedMediaCache = new Map();
    const originalFetch = global.fetch;
    let fetchCount = 0;

    global.fetch = async () => {
        fetchCount += 1;
        return {
            ok: true,
            headers: {
                get(name = '') {
                    const key = String(name || '').trim().toLowerCase();
                    if (key === 'content-type') return 'image/png';
                    if (key === 'content-length') return '4';
                    return '';
                }
            },
            arrayBuffer: async () => Uint8Array.from([1, 2, 3, 4]).buffer
        };
    };

    try {
        const helpers = createMessageMediaAssetsHelpers({
            fs: require('fs'),
            path,
            URL,
            Buffer,
            resolveAndValidatePublicHost: async () => true,
            getSharpImageProcessor: () => null,
            SAAS_UPLOADS_ROOT: path.resolve(__dirname, '../uploads'),
            QUICK_REPLY_MEDIA_MAX_BYTES: 1024 * 1024,
            QUICK_REPLY_MEDIA_TIMEOUT_MS: 5000,
            processedMediaCache
        });

        const first = await helpers.fetchCatalogProductImage('https://cdn.example.com/catalog/product.png', {
            tenantId: 'tenant_media_cache'
        });
        const second = await helpers.fetchCatalogProductImage('https://cdn.example.com/catalog/product.png', {
            tenantId: 'tenant_media_cache'
        });

        assert.ok(first?.mediaData, 'first fetch should return media data');
        assert.ok(second?.mediaData, 'second fetch should return media data');
        assert.equal(fetchCount, 1, 'remote image should only be fetched once');
        assert.equal(processedMediaCache.size, 1, 'processed media cache should contain one entry');
        assert.equal(first.mediaData, second.mediaData, 'cached media should match the original result');
    } finally {
        global.fetch = originalFetch;
    }
});

test('cloud client reuses cached mediaId and refreshes it when Meta invalidates the old one', async () => {
    const originalUploadMedia = cloudClient.uploadMedia;
    const originalSendMediaMessageByMediaId = cloudClient.sendMediaMessageByMediaId;
    const originalResolveSendWaId = cloudClient.resolveSendWaId;
    const originalRuntimeConfig = { ...(cloudClient.runtimeConfig || {}) };
    const originalReady = cloudClient.isReady;

    cloudClient.mediaIdCache.clear();
    cloudClient.setRuntimeConfig({
        tenantId: 'tenant_media_cache',
        appId: 'app_test',
        phoneNumberId: 'phone_test',
        systemUserToken: 'token_test'
    });
    cloudClient.isReady = true;

    let uploadCount = 0;
    let sendCount = 0;

    cloudClient.resolveSendWaId = async () => '51999999999';
    cloudClient.uploadMedia = async () => {
        uploadCount += 1;
        return uploadCount === 1 ? 'media_fresh_a' : 'media_fresh_b';
    };
    cloudClient.sendMediaMessageByMediaId = async (_waId, _type, mediaId) => {
        sendCount += 1;
        if (mediaId === 'media_stale') {
            const error = new Error('Cloud API error 400: Invalid media id');
            error.code = 100;
            throw error;
        }
        return { messages: [{ id: `wamid.${mediaId}.${sendCount}` }] };
    };

    try {
        const mediaData = Buffer.from('demo-binary').toString('base64');

        await cloudClient.sendMedia('51999999999@c.us', mediaData, 'image/png', 'demo.png', 'hola');
        assert.equal(uploadCount, 1, 'first send should upload media');
        assert.equal(sendCount, 1, 'first send should send once');

        await cloudClient.sendMedia('51999999999@c.us', mediaData, 'image/png', 'demo.png', 'hola');
        assert.equal(uploadCount, 1, 'second send should reuse cached mediaId without reupload');
        assert.equal(sendCount, 2, 'second send should send once using cached mediaId');

        const contentHash = cloudClient.buildMediaContentHash(mediaData);
        cloudClient.setCachedMediaId(contentHash, {
            mediaId: 'media_stale',
            mimetype: 'image/png',
            filename: 'demo.png',
            createdAt: Date.now() - 1000,
            lastUsedAt: Date.now() - 1000
        });

        await cloudClient.sendMedia('51999999999@c.us', mediaData, 'image/png', 'demo.png', 'hola');
        assert.equal(uploadCount, 2, 'stale cached mediaId should trigger a fresh upload');
        assert.equal(sendCount, 4, 'stale mediaId should fail once, then resend with a fresh mediaId');

        const cached = cloudClient.getCachedMediaId(contentHash);
        assert.equal(cached?.mediaId, 'media_fresh_b', 'cache should be refreshed with the new mediaId');
    } finally {
        cloudClient.uploadMedia = originalUploadMedia;
        cloudClient.sendMediaMessageByMediaId = originalSendMediaMessageByMediaId;
        cloudClient.resolveSendWaId = originalResolveSendWaId;
        cloudClient.mediaIdCache.clear();
        cloudClient.setRuntimeConfig(originalRuntimeConfig);
        cloudClient.isReady = originalReady;
    }
});
