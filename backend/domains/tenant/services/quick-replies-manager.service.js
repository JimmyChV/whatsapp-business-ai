const path = require('path');
const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    readTenantJsonFile,
    writeTenantJsonFile
} = require('../../../config/persistence-runtime');
const quickReplyLibrariesService = require('./quick-reply-libraries.service');

const QUICK_REPLIES_FILE = 'quick_replies.json';
const LEGACY_QUICK_REPLIES_PATH = path.join(__dirname, '../../../data/legacy/quick_replies.json');

const DEFAULT_QUICK_REPLIES = [
    { id: 'qr_saludo', label: 'Saludo', text: 'Hola. Bienvenido a nuestro negocio. En que puedo ayudarte hoy?' },
    { id: 'qr_metodo_pago', label: 'Metodo de pago', text: 'Puedes pagar mediante:\n- Transferencia bancaria\n- Yape / Plin\n- Efectivo\n\nCual prefieres?' },
    { id: 'qr_horario', label: 'Horario', text: 'Nuestro horario de atencion es:\nLunes a Sabado: 9:00 AM - 7:00 PM\nTambien puedes escribirnos por WhatsApp.' },
    { id: 'qr_en_camino', label: 'En camino', text: 'Tu pedido esta en camino. Te avisamos en cuanto llegue. Gracias por tu paciencia.' },
    { id: 'qr_confirmado', label: 'Confirmado', text: 'Perfecto. Tu pedido ha sido confirmado. Lo procesamos lo antes posible. Gracias.' },
    { id: 'qr_mas_info', label: 'Mas info', text: 'Con gusto te doy mas informacion. Que producto o servicio te interesa?' },
    { id: 'qr_comprobante', label: 'Comprobante', text: 'Para confirmar tu pago, por favor envianos una foto del comprobante de transferencia. Gracias.' },
    { id: 'qr_gracias', label: 'Gracias', text: 'Muchas gracias por tu compra. Ha sido un placer atenderte. Hasta pronto.' },
    { id: 'qr_seguimiento', label: 'Seguimiento', text: 'Hola, queria hacer seguimiento a tu consulta. Pudiste revisar la informacion que te comparti?' },
    { id: 'qr_espera', label: 'Espera', text: 'Un momento por favor, estoy verificando la informacion para ti.' }
];

function resolveTenantId(input = null) {
    if (typeof input === 'string') {
        return normalizeTenantId(input || DEFAULT_TENANT_ID);
    }
    if (input && typeof input === 'object') {
        return normalizeTenantId(input.tenantId || DEFAULT_TENANT_ID);
    }
    return DEFAULT_TENANT_ID;
}

function sanitizeEntry(input = {}, { requireAll = false } = {}) {
    const id = String(input?.id || '').trim();
    const label = String(input?.label || '').trim();
    const text = String(input?.text || '').trim();

    if (requireAll && (!label || !text)) return null;
    if (!id && !requireAll) return null;

    return {
        id,
        label: label || 'Respuesta rapida',
        text,
    };
}

function normalizeStore(items = []) {
    return (Array.isArray(items) ? items : [])
        .map((item) => sanitizeEntry(item, { requireAll: true }))
        .filter(Boolean)
        .map((item, idx) => ({
            ...item,
            id: item.id || `qr_${idx + 1}`,
        }));
}

function missingRelation(error) {
    return String(error?.code || '').trim() === '42P01';
}

async function readStoreFromFile(tenantId) {
    const parsed = await readTenantJsonFile(QUICK_REPLIES_FILE, {
        tenantId,
        defaultValue: () => DEFAULT_QUICK_REPLIES,
        legacyPath: LEGACY_QUICK_REPLIES_PATH
    });
    return normalizeStore(parsed);
}

async function writeStoreToFile(items = [], tenantId = DEFAULT_TENANT_ID) {
    const normalized = normalizeStore(items);
    await writeTenantJsonFile(QUICK_REPLIES_FILE, normalized, {
        tenantId,
        mirrorLegacyPath: LEGACY_QUICK_REPLIES_PATH
    });
    return normalized;
}

async function listFromPostgres(tenantId, moduleId = '') {
    try {
        const scoped = await quickReplyLibrariesService.listQuickReplyItems({
            tenantId,
            moduleId: String(moduleId || '').trim().toLowerCase(),
            includeInactive: false
        });

        return scoped.map((entry) => {
            const mediaAssets = Array.isArray(entry?.mediaAssets)
                ? entry.mediaAssets
                    .map((asset) => ({
                        url: String(asset?.url || asset?.mediaUrl || '').trim() || null,
                        mimeType: String(asset?.mimeType || asset?.mediaMimeType || '').trim().toLowerCase() || null,
                        fileName: String(asset?.fileName || asset?.mediaFileName || '').trim() || null,
                        sizeBytes: Number.isFinite(Number(asset?.sizeBytes ?? asset?.mediaSizeBytes)) ? Number(asset?.sizeBytes ?? asset?.mediaSizeBytes) : null
                    }))
                    .filter((asset) => Boolean(asset.url))
                : [];
            return {
                id: String(entry?.itemId || entry?.id || '').trim(),
                label: String(entry?.label || '').trim(),
                text: String(entry?.text || '').trim(),
                mediaAssets,
                mediaUrl: String(entry?.mediaUrl || mediaAssets[0]?.url || '').trim() || null,
                mediaMimeType: String(entry?.mediaMimeType || mediaAssets[0]?.mimeType || '').trim().toLowerCase() || null,
                mediaFileName: String(entry?.mediaFileName || mediaAssets[0]?.fileName || '').trim() || null,
                mediaSizeBytes: Number.isFinite(Number(entry?.mediaSizeBytes)) ? Number(entry.mediaSizeBytes) : (mediaAssets[0]?.sizeBytes || null),
                libraryId: String(entry?.libraryId || '').trim() || null,
                libraryName: String(entry?.libraryName || '').trim() || null,
                isShared: entry?.isShared !== false,
                moduleIds: Array.isArray(entry?.moduleIds) ? entry.moduleIds : []
            };
        }).filter((entry) => entry.id && (entry.text || entry.mediaUrl || (Array.isArray(entry.mediaAssets) && entry.mediaAssets.length > 0)));
    } catch (error) {
        if (missingRelation(error)) return [];
        throw error;
    }
}

async function upsertPostgres(item, tenantId, sortOrder = 1000) {
    await quickReplyLibrariesService.saveQuickReplyItem({
        itemId: item.id,
        libraryId: quickReplyLibrariesService.DEFAULT_LIBRARY_ID,
        label: item.label,
        text: item.text,
        sortOrder,
        isActive: true
    }, { tenantId });
}

async function deletePostgres(id, tenantId) {
    await quickReplyLibrariesService.deactivateQuickReplyItem(id, { tenantId });
}

async function listQuickReplies(options = null) {
    const tenantId = resolveTenantId(options);
    const moduleId = String(options?.moduleId || '').trim().toLowerCase();
    if (getStorageDriver() === 'postgres') {
        return listFromPostgres(tenantId, moduleId);
    }
    return readStoreFromFile(tenantId);
}

async function addQuickReply({ label, text }, options = null) {
    const tenantId = resolveTenantId(options);
    const clean = sanitizeEntry({ label, text, id: `qr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}` }, { requireAll: true });
    if (!clean) throw new Error('Datos invalidos para respuesta rapida.');

    if (getStorageDriver() === 'postgres') {
        const current = await listFromPostgres(tenantId, String(options?.moduleId || '').trim().toLowerCase());
        await upsertPostgres(clean, tenantId, Math.max(1, current.length + 1));
        return clean;
    }

    const current = await readStoreFromFile(tenantId);
    current.unshift(clean);
    await writeStoreToFile(current, tenantId);
    return clean;
}

async function updateQuickReply({ id, label, text }, options = null) {
    const tenantId = resolveTenantId(options);
    const cleanId = String(id || '').trim();
    if (!cleanId) throw new Error('ID de respuesta rapida invalido.');

    const cleanLabel = String(label || '').trim();
    const cleanText = String(text || '').trim();
    if (!cleanLabel || !cleanText) throw new Error('La respuesta rapida requiere titulo y texto.');

    const current = await listQuickReplies({ tenantId, moduleId: String(options?.moduleId || '').trim().toLowerCase() });
    const target = current.find((item) => item.id === cleanId);
    if (!target) throw new Error('Respuesta rapida no encontrada.');

    const updated = { ...target, label: cleanLabel, text: cleanText };

    if (getStorageDriver() === 'postgres') {
        await upsertPostgres(updated, tenantId, current.findIndex((item) => item.id === cleanId) + 1);
        return updated;
    }

    const next = current.map((item) => item.id === cleanId ? updated : item);
    await writeStoreToFile(next, tenantId);
    return updated;
}

async function deleteQuickReply(id, options = null) {
    const tenantId = resolveTenantId(options);
    const cleanId = String(id || '').trim();
    if (!cleanId) throw new Error('ID de respuesta rapida invalido.');

    if (getStorageDriver() === 'postgres') {
        await deletePostgres(cleanId, tenantId);
        return { id: cleanId };
    }

    const current = await readStoreFromFile(tenantId);
    const next = current.filter((item) => item.id !== cleanId);
    if (next.length === current.length) throw new Error('Respuesta rapida no encontrada.');

    await writeStoreToFile(next, tenantId);
    return { id: cleanId };
}

module.exports = {
    listQuickReplies,
    addQuickReply,
    updateQuickReply,
    deleteQuickReply,
};

