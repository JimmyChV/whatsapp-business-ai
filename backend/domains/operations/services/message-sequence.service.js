const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { getStorageDriver, queryPostgres } = require('../../../config/persistence-runtime');
const { resolveAndValidatePublicHost } = require('../../security/helpers/security-utils');
const { createMessageMediaAssetsHelpers } = require('../../channels/helpers/message-media-assets.helpers');
const { createLazySharpLoader } = require('../../channels/helpers/socket-runtime-bootstrap.helpers');
const {
    buildNativeProductInteractive,
    buildNativeCatalogInteractive
} = require('../../channels/services/socket-catalog-delivery.service');

const DEFAULT_SAAS_UPLOADS_ROOT = path.resolve(__dirname, '../../../uploads');
const SAAS_UPLOADS_ROOT = path.resolve(String(process.env.SAAS_UPLOADS_DIR || DEFAULT_SAAS_UPLOADS_ROOT).trim() || DEFAULT_SAAS_UPLOADS_ROOT);
const SEQUENCE_MEDIA_MAX_BYTES = Math.max(
    256 * 1024,
    Number(process.env.MESSAGE_SEQUENCE_MEDIA_MAX_BYTES || process.env.QUICK_REPLY_MEDIA_MAX_BYTES || process.env.ADMIN_ASSET_QUICK_REPLY_MAX_BYTES || (50 * 1024 * 1024))
);
const SEQUENCE_MEDIA_TIMEOUT_MS = Math.max(
    2000,
    Number(process.env.MESSAGE_SEQUENCE_MEDIA_TIMEOUT_MS || process.env.QUICK_REPLY_MEDIA_TIMEOUT_MS || 15000)
);
const DEFAULT_MIN_DELAY_SECONDS = 1;
const DEFAULT_MAX_DELAY_SECONDS = 30;

const { fetchQuickReplyMedia } = createMessageMediaAssetsHelpers({
    fs,
    path,
    URL,
    Buffer,
    resolveAndValidatePublicHost,
    getSharpImageProcessor: createLazySharpLoader(),
    SAAS_UPLOADS_ROOT,
    QUICK_REPLY_MEDIA_MAX_BYTES: SEQUENCE_MEDIA_MAX_BYTES,
    QUICK_REPLY_MEDIA_TIMEOUT_MS: SEQUENCE_MEDIA_TIMEOUT_MS,
    processedMediaCache: new Map()
});

class MessageSequenceBlockError extends Error {
    constructor(message, { blockIndex = null, blockType = '' } = {}) {
        super(message);
        this.name = 'MessageSequenceBlockError';
        this.blockIndex = blockIndex;
        this.blockType = blockType;
    }
}

function text(value = '') {
    return String(value ?? '').trim();
}

function lower(value = '') {
    return text(value).toLowerCase();
}

function clampNumber(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

function sleep(ms = 0) {
    const safeMs = Math.max(0, Number(ms) || 0);
    if (!safeMs) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, safeMs));
}

function normalizeAttachment(entry = {}) {
    const source = entry && typeof entry === 'object' ? entry : {};
    const url = text(source.url || source.mediaUrl || source.dataUrl || '');
    if (!url) return null;
    const mimeType = lower(source.mimeType || source.mediaMimeType || source.mime || '');
    const fileName = text(source.fileName || source.mediaFileName || source.filename || '');
    const sizeRaw = Number(source.sizeBytes ?? source.mediaSizeBytes);
    const sizeBytes = Number.isFinite(sizeRaw) && sizeRaw > 0 ? Math.floor(sizeRaw) : null;
    const explicitType = lower(source.type || source.kind || '');
    let type = explicitType;
    if (!type) {
        if (mimeType.startsWith('image/')) type = 'image';
        else if (mimeType.startsWith('audio/')) type = 'audio';
        else if (mimeType.startsWith('video/')) type = 'video';
        else type = 'document';
    }
    return {
        type,
        url,
        fileName,
        mimeType,
        sizeBytes
    };
}

function normalizeAttachments(value = [], fallback = {}) {
    const source = Array.isArray(value) ? value : [];
    const seen = new Set();
    const normalized = source
        .map(normalizeAttachment)
        .filter(Boolean)
        .filter((asset) => {
            const key = `${asset.url}|${asset.fileName}|${asset.mimeType}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    if (normalized.length > 0) return normalized;
    const fallbackAsset = normalizeAttachment(fallback);
    return fallbackAsset ? [fallbackAsset] : [];
}

function createBlockId(index = 0) {
    return `blk_${Date.now().toString(36)}_${String(index + 1)}`;
}

function normalizeMessageBlock(block = {}, index = 0) {
    const source = block && typeof block === 'object' ? block : {};
    const type = lower(source.type || 'message');
    const id = text(source.id || source.blockId || '') || createBlockId(index);

    if (type === 'delay') {
        return {
            id,
            type: 'delay',
            delaySeconds: clampNumber(source.delaySeconds ?? source.delay_seconds, 1, DEFAULT_MAX_DELAY_SECONDS, 3)
        };
    }

    if (type === 'catalog') {
        return {
            id,
            type: 'catalog',
            text: text(source.text || source.bodyText || source.body || '')
        };
    }

    if (type === 'product') {
        return {
            id,
            type: 'product',
            sku: text(source.sku || source.productRetailerId || source.product_retailer_id || source.itemId || source.item_id || '')
        };
    }

    const attachments = normalizeAttachments(source.attachments || source.mediaAssets, {
        url: source.mediaUrl || source.media_url,
        mimeType: source.mediaMimeType || source.media_mime_type,
        fileName: source.mediaFileName || source.media_file_name,
        sizeBytes: source.mediaSizeBytes || source.media_size_bytes
    });

    return {
        id,
        type: 'message',
        text: String(source.text ?? source.bodyText ?? source.body ?? ''),
        attachments
    };
}

function buildFallbackBlocksFromLegacy({
    text: legacyText = '',
    mediaAssets = [],
    mediaUrl = '',
    mediaMimeType = '',
    mediaFileName = '',
    mediaSizeBytes = null
} = {}) {
    const attachments = normalizeAttachments(mediaAssets, {
        url: mediaUrl,
        mimeType: mediaMimeType,
        fileName: mediaFileName,
        sizeBytes: mediaSizeBytes
    });
    const body = String(legacyText || '');
    if (!body.trim() && attachments.length === 0) return [];
    return [{
        id: 'legacy_1',
        type: 'message',
        text: body,
        attachments
    }];
}

function normalizeMessageBlocks(blocks = [], fallback = {}) {
    const source = Array.isArray(blocks) ? blocks : [];
    const normalized = source
        .map((block, index) => normalizeMessageBlock(block, index))
        .filter((block) => {
            if (!block?.type) return false;
            if (block.type === 'message') return Boolean(String(block.text || '').trim() || block.attachments?.length);
            if (block.type === 'delay') return Number(block.delaySeconds || 0) > 0;
            if (block.type === 'catalog') return true;
            if (block.type === 'product') return Boolean(text(block.sku));
            return false;
        });
    return normalized.length > 0 ? normalized : buildFallbackBlocksFromLegacy(fallback);
}

function resolveVariables(source = '', variables = {}) {
    const map = variables && typeof variables === 'object' && !Array.isArray(variables) ? variables : {};
    return String(source || '').replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, rawKey) => {
        const key = text(rawKey).toLowerCase();
        const direct = map[key] ?? map[rawKey];
        if (direct !== undefined && direct !== null) return String(direct);
        const nested = key.split('.').reduce((acc, part) => (
            acc && Object.prototype.hasOwnProperty.call(acc, part) ? acc[part] : undefined
        ), map);
        return nested === undefined || nested === null ? '' : String(nested);
    });
}

async function loadNativeCatalogIdFromDb(tenantId = '') {
    const cleanTenantId = text(tenantId);
    if (!cleanTenantId || getStorageDriver() !== 'postgres') return '';
    try {
        const { rows } = await queryPostgres(
            `SELECT config_json->'metaAds'->>'catalogId' as catalog_id
               FROM tenant_integrations
              WHERE tenant_id = $1
              LIMIT 1`,
            [cleanTenantId]
        );
        return text(rows?.[0]?.catalog_id);
    } catch (_error) {
        return '';
    }
}

function resolveSentId(sent = null) {
    return text(sent?.id?._serialized || sent?.id || sent?.messageId || sent?.message_id || sent?.messages?.[0]?.id || (typeof sent === 'string' ? sent : ''));
}

async function executeMessageSequence({
    tenantId = '',
    chatId = '',
    scopeModuleId = '',
    blocks = [],
    waClient,
    variables = {},
    metadata = {},
    quotedMessageId = '',
    quotedMessage = null,
    onSentMessage = null,
    minDelayBetweenSendBlocksSeconds = DEFAULT_MIN_DELAY_SECONDS,
    maxDelaySeconds = DEFAULT_MAX_DELAY_SECONDS,
    logger = null
} = {}) {
    const normalized = normalizeMessageBlocks(blocks);
    if (!text(chatId)) throw new Error('chatId requerido para enviar secuencia.');
    if (!waClient?.sendMessage) throw new Error('transport_unavailable');
    if (normalized.length === 0) throw new Error('empty_sequence');

    const minDelaySeconds = clampNumber(minDelayBetweenSendBlocksSeconds, 0, DEFAULT_MAX_DELAY_SECONDS, DEFAULT_MIN_DELAY_SECONDS);
    const maxDelay = clampNumber(maxDelaySeconds, 1, DEFAULT_MAX_DELAY_SECONDS, DEFAULT_MAX_DELAY_SECONDS);
    const sentMessageIds = [];
    let sentBlocks = 0;
    let lastBlockWasDelay = false;
    let metaCatalogId = text(metadata?.metaCatalogId || metadata?.meta_catalog_id || '');

    for (let index = 0; index < normalized.length; index += 1) {
        const block = normalized[index];
        const blockType = block.type;
        try {
            if (blockType === 'delay') {
                const delaySeconds = clampNumber(block.delaySeconds, 1, maxDelay, 3);
                await sleep(delaySeconds * 1000);
                lastBlockWasDelay = true;
                continue;
            }

            if (sentBlocks > 0 && !lastBlockWasDelay && minDelaySeconds > 0) {
                await sleep(minDelaySeconds * 1000);
            }
            lastBlockWasDelay = false;

            const sendMetadata = {
                ...metadata,
                tenantId: text(tenantId) || metadata?.tenantId,
                chatId,
                scopeModuleId: scopeModuleId || metadata?.scopeModuleId || '',
                sequenceBlockIndex: index,
                sequenceBlockType: blockType
            };
            const effectiveQuotedMessageId = sentBlocks === 0 ? text(quotedMessageId) : '';

            if (blockType === 'message') {
                const body = resolveVariables(block.text || '', variables);
                const attachments = normalizeAttachments(block.attachments);
                if (!body.trim() && attachments.length === 0) {
                    throw new MessageSequenceBlockError('empty_message_block', { blockIndex: index, blockType });
                }

                if (attachments.length > 0) {
                    if (!waClient?.sendMedia) throw new Error('media_unavailable');
                    for (let assetIndex = 0; assetIndex < attachments.length; assetIndex += 1) {
                        const asset = attachments[assetIndex];
                        const fetched = await fetchQuickReplyMedia(asset.url, {
                            tenantId,
                            maxBytes: SEQUENCE_MEDIA_MAX_BYTES,
                            timeoutMs: SEQUENCE_MEDIA_TIMEOUT_MS,
                            mimeHint: asset.mimeType,
                            fileNameHint: asset.fileName
                        });
                        if (!fetched?.mediaData) throw new Error('media_unavailable');
                        const sent = await waClient.sendMedia(
                            chatId,
                            fetched.mediaData,
                            fetched.mimetype || asset.mimeType || 'application/octet-stream',
                            fetched.filename || asset.fileName || 'adjunto',
                            assetIndex === 0 ? body : '',
                            false,
                            assetIndex === 0 ? (effectiveQuotedMessageId || null) : null,
                            {
                                ...sendMetadata,
                                mediaUrl: text(fetched.publicUrl || fetched.sourceUrl || asset.url) || null,
                                sequenceAttachmentIndex: assetIndex
                            }
                        );
                        const sentId = resolveSentId(sent);
                        if (sentId) sentMessageIds.push(sentId);
                        if (typeof onSentMessage === 'function') {
                            await onSentMessage({
                                sentMessage: sent,
                                fallbackBody: assetIndex === 0 ? body : '',
                                quotedMessageId: assetIndex === 0 ? effectiveQuotedMessageId : '',
                                quotedMessage: assetIndex === 0 && effectiveQuotedMessageId ? quotedMessage : null,
                                mediaPayload: {
                                    mimetype: fetched.mimetype || asset.mimeType || 'application/octet-stream',
                                    filename: fetched.filename || asset.fileName || 'adjunto',
                                    fileSizeBytes: Number(fetched?.fileSizeBytes || asset?.sizeBytes || 0) || null,
                                    mediaUrl: text(fetched.publicUrl || fetched.sourceUrl || asset.url) || null,
                                    mediaPath: text(fetched.relativePath || '') || null
                                },
                                block,
                                blockIndex: index,
                                attachmentIndex: assetIndex
                            });
                        }
                    }
                } else {
                    const sendOptions = { metadata: sendMetadata };
                    if (effectiveQuotedMessageId) sendOptions.quotedMessageId = effectiveQuotedMessageId;
                    const sent = await waClient.sendMessage(chatId, body, sendOptions);
                    const sentId = resolveSentId(sent);
                    if (sentId) sentMessageIds.push(sentId);
                    if (typeof onSentMessage === 'function') {
                        await onSentMessage({
                            sentMessage: sent,
                            fallbackBody: body,
                            quotedMessageId: effectiveQuotedMessageId,
                            quotedMessage: effectiveQuotedMessageId ? quotedMessage : null,
                            mediaPayload: null,
                            block,
                            blockIndex: index
                        });
                    }
                }
                sentBlocks += 1;
                continue;
            }

            if (blockType === 'catalog' || blockType === 'product') {
                if (!waClient?.sendInteractiveMessage) throw new Error('interactive_unavailable');
                if (!metaCatalogId) metaCatalogId = await loadNativeCatalogIdFromDb(tenantId);
                if (!metaCatalogId) throw new Error('missing_catalog_id');

                const interactive = blockType === 'catalog'
                    ? buildNativeCatalogInteractive({ bodyText: resolveVariables(block.text || '', variables) })
                    : buildNativeProductInteractive({}, metaCatalogId, block.sku);
                const sent = await waClient.sendInteractiveMessage(chatId, interactive, {
                    quotedMessageId: effectiveQuotedMessageId || '',
                    metadata: {
                        ...sendMetadata,
                        deliveryMode: blockType === 'catalog' ? 'native_catalog_message' : 'native_catalog_product',
                        metaCatalogId,
                        productRetailerId: blockType === 'product' ? block.sku : null
                    }
                });
                const sentId = resolveSentId(sent);
                if (sentId) sentMessageIds.push(sentId);
                if (typeof onSentMessage === 'function') {
                    await onSentMessage({
                        sentMessage: sent,
                        fallbackBody: blockType === 'catalog' ? '' : block.sku,
                        quotedMessageId: effectiveQuotedMessageId,
                        quotedMessage: effectiveQuotedMessageId ? quotedMessage : null,
                        mediaPayload: null,
                        block,
                        blockIndex: index,
                        interactive
                    });
                }
                sentBlocks += 1;
                continue;
            }
        } catch (error) {
            logger?.warn?.(`[MessageSequence] block ${index} (${blockType}) failed: ${String(error?.message || error)}`);
            if (error instanceof MessageSequenceBlockError) throw error;
            throw new MessageSequenceBlockError(String(error?.message || error || 'sequence_block_failed'), {
                blockIndex: index,
                blockType
            });
        }
    }

    if (sentBlocks === 0) throw new Error('empty_sequence');
    return {
        ok: true,
        sentBlocks,
        sentMessageIds,
        firstMessageId: sentMessageIds[0] || null,
        lastMessageId: sentMessageIds[sentMessageIds.length - 1] || null
    };
}

module.exports = {
    MessageSequenceBlockError,
    normalizeMessageBlocks,
    buildFallbackBlocksFromLegacy,
    executeMessageSequence,
    resolveVariables,
    sleep
};
