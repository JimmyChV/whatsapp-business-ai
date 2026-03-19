export const EMPTY_AI_ASSISTANT_FORM = {
    assistantId: '',
    name: '',
    description: '',
    provider: 'openai',
    model: 'gpt-4o-mini',
    systemPrompt: '',
    temperature: '0.7',
    topP: '1',
    maxTokens: '800',
    openaiApiKey: '',
    openAiApiKeyMasked: '',
    isActive: true,
    isDefault: false
};

export const AI_PROVIDER_OPTIONS = ['openai'];
export const AI_MODEL_OPTIONS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'];

export const LAVITAT_FIRST_ASSISTANT_SYSTEM_PROMPT = `Eres el copiloto comercial interno de Lavitat (Peru). Tu interlocutor es la vendedora, no el cliente final.

Objetivo:
- ayudar a vender mejor con criterio comercial
- sugerir respuestas listas para WhatsApp
- recomendar productos reales del catalogo activo
- proponer upsell/cross-sell con naturalidad
- generar cotizaciones claras cuando se solicite

Reglas innegociables:
- usa solo datos reales del sistema (tenant, modulo, catalogo, carrito, chat)
- no inventes productos, precios, descuentos, stock, presentaciones o aromas
- no mezcles informacion entre tenants
- si falta un dato clave, dilo de forma ejecutiva y sugiere como validar antes de enviar

Tono Lavitat:
- amigable, claro, experto, seguro, calido y elegante
- evita tono suplicante, vulgar, agresivo o improvisado
- comunica valor (calidad, rendimiento, cuidado de tejidos/superficies, servicio)

Cuando corresponda, resalta:
- detergente concentrado: formula enzimatica y cuidado de tejidos
- linea delicada: hipoalergenica, ideal para bebes/piel sensible/lenceria
- limpiador desinfectante: limpia + desinfecta + aromatiza
- quitasarro gel: mejor rendimiento por aplicacion

Formato recomendado para copiloto:
1) 3 respuestas sugeridas (listas para copiar)
2) recomendacion comercial (producto principal + complemento + motivo)
3) cierre sugerido
4) 3 cotizaciones separadas si aplica`;

export function sanitizeAiAssistantCode(value = '') {
    const clean = String(value || '').trim().toUpperCase();
    return /^AIA-[A-Z0-9]{6}$/.test(clean) ? clean : '';
}

export function normalizeTenantAiAssistantItem(item = {}) {
    const source = item && typeof item === 'object' ? item : {};
    const assistantId = sanitizeAiAssistantCode(source.assistantId || source.id || '');
    if (!assistantId) return null;
    return {
        assistantId,
        name: String(source.name || assistantId).trim() || assistantId,
        description: String(source.description || '').trim(),
        provider: String(source.provider || 'openai').trim().toLowerCase() || 'openai',
        model: String(source.model || 'gpt-4o-mini').trim() || 'gpt-4o-mini',
        systemPrompt: String(source.systemPrompt || '').trim(),
        temperature: String(source.temperature ?? '0.7').trim() || '0.7',
        topP: String(source.topP ?? '1').trim() || '1',
        maxTokens: String(source.maxTokens ?? '800').trim() || '800',
        hasOpenAiApiKey: source.hasOpenAiApiKey === true,
        openAiApiKeyMasked: String(source.openAiApiKeyMasked || '').trim(),
        isActive: source.isActive !== false,
        isDefault: source.isDefault === true,
        createdAt: String(source.createdAt || '').trim() || null,
        updatedAt: String(source.updatedAt || '').trim() || null
    };
}

export function buildAiAssistantFormFromItem(item = null) {
    if (!item || typeof item !== 'object') return { ...EMPTY_AI_ASSISTANT_FORM };
    return {
        assistantId: sanitizeAiAssistantCode(item.assistantId || item.id || ''),
        name: String(item.name || '').trim(),
        description: String(item.description || '').trim(),
        provider: String(item.provider || 'openai').trim().toLowerCase() || 'openai',
        model: String(item.model || 'gpt-4o-mini').trim() || 'gpt-4o-mini',
        systemPrompt: String(item.systemPrompt || '').trim(),
        temperature: String(item.temperature ?? '0.7').trim() || '0.7',
        topP: String(item.topP ?? '1').trim() || '1',
        maxTokens: String(item.maxTokens ?? '800').trim() || '800',
        openaiApiKey: '',
        openAiApiKeyMasked: String(item.openAiApiKeyMasked || '').trim(),
        isActive: item.isActive !== false,
        isDefault: item.isDefault === true
    };
}

export function buildLavitatAssistantPreset(form = {}) {
    const source = form && typeof form === 'object' ? form : {};
    const modelCandidate = String(source.model || '').trim();
    const safeModel = AI_MODEL_OPTIONS.includes(modelCandidate) ? modelCandidate : 'gpt-4o-mini';
    return {
        ...source,
        name: String(source.name || '').trim() || 'Asistente Comercial Lavitat',
        description: String(source.description || '').trim() || 'Copiloto interno de ventas para Lavitat. Sugiere respuestas, recomendaciones y cotizaciones desde contexto real del tenant.',
        provider: 'openai',
        model: safeModel,
        systemPrompt: LAVITAT_FIRST_ASSISTANT_SYSTEM_PROMPT,
        temperature: '0.45',
        topP: '0.95',
        maxTokens: '1200',
        isActive: source.isActive !== false
    };
}

export function buildAiAssistantPayload(form = {}, { allowAssistantId = true } = {}) {
    const source = form && typeof form === 'object' ? form : {};
    const payload = {
        name: String(source.name || '').trim(),
        description: String(source.description || '').trim() || null,
        provider: AI_PROVIDER_OPTIONS.includes(String(source.provider || '').trim().toLowerCase())
            ? String(source.provider || '').trim().toLowerCase()
            : 'openai',
        model: String(source.model || 'gpt-4o-mini').trim() || 'gpt-4o-mini',
        systemPrompt: String(source.systemPrompt || '').trim() || null,
        temperature: Math.max(0, Math.min(2, Number(source.temperature ?? 0.7) || 0.7)),
        topP: Math.max(0, Math.min(1, Number(source.topP ?? 1) || 1)),
        maxTokens: Math.max(64, Math.min(4096, Number(source.maxTokens ?? 800) || 800)),
        isActive: source.isActive !== false,
        isDefault: source.isDefault === true
    };

    const openaiApiKey = String(source.openaiApiKey || '').trim();
    if (openaiApiKey) payload.openaiApiKey = openaiApiKey;

    if (allowAssistantId) {
        const cleanAssistantId = sanitizeAiAssistantCode(source.assistantId || source.id || '');
        if (cleanAssistantId) payload.assistantId = cleanAssistantId;
    }

    return payload;
}

