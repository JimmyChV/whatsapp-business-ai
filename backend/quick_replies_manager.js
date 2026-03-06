const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, 'quick_replies.json');

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

function ensureStore() {
    if (fs.existsSync(STORE_PATH)) return;
    fs.writeFileSync(STORE_PATH, JSON.stringify(DEFAULT_QUICK_REPLIES, null, 2), 'utf8');
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

function readStore() {
    ensureStore();
    try {
        const raw = fs.readFileSync(STORE_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((item) => sanitizeEntry(item, { requireAll: true }))
            .filter(Boolean)
            .map((item, idx) => ({
                ...item,
                id: item.id || `qr_${idx + 1}`,
            }));
    } catch (error) {
        return [...DEFAULT_QUICK_REPLIES];
    }
}

function writeStore(items = []) {
    fs.writeFileSync(STORE_PATH, JSON.stringify(items, null, 2), 'utf8');
}

function listQuickReplies() {
    return readStore();
}

function addQuickReply({ label, text }) {
    const clean = sanitizeEntry({ label, text, id: `qr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}` }, { requireAll: true });
    if (!clean) throw new Error('Datos invalidos para respuesta rapida.');

    const current = readStore();
    current.unshift(clean);
    writeStore(current);
    return clean;
}

function updateQuickReply({ id, label, text }) {
    const cleanId = String(id || '').trim();
    if (!cleanId) throw new Error('ID de respuesta rapida invalido.');

    const cleanLabel = String(label || '').trim();
    const cleanText = String(text || '').trim();
    if (!cleanLabel || !cleanText) throw new Error('La respuesta rapida requiere titulo y texto.');

    const current = readStore();
    const next = current.map((item) => item.id === cleanId ? { ...item, label: cleanLabel, text: cleanText } : item);
    if (!next.some((item) => item.id === cleanId)) throw new Error('Respuesta rapida no encontrada.');

    writeStore(next);
    return next.find((item) => item.id === cleanId);
}

function deleteQuickReply(id) {
    const cleanId = String(id || '').trim();
    if (!cleanId) throw new Error('ID de respuesta rapida invalido.');

    const current = readStore();
    const next = current.filter((item) => item.id !== cleanId);
    if (next.length === current.length) throw new Error('Respuesta rapida no encontrada.');

    writeStore(next);
    return { id: cleanId };
}

module.exports = {
    listQuickReplies,
    addQuickReply,
    updateQuickReply,
    deleteQuickReply,
};
