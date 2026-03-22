const fs = require('fs');
const path = require('path');
const tenantIntegrationsService = require('../../tenant/services/integrations.service');
const { buildAiPromptPackage } = require('./ai-prompt-context.service');

function sanitizeApiKey(value = '') {
    return String(value || '')
        .trim()
        .replace(/^["']|["']$/g, '')
        .replace(/\s+/g, '');
}

function clipText(value = '', maxLen = 600) {
    const text = String(value || '');
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + '...';
}

function normalizeAssistantId(value = '') {
    const clean = String(value || '').trim().toUpperCase();
    return /^AIA-[A-Z0-9]{6}$/.test(clean) ? clean : '';
}

function normalizeAiNumber(value, fallback, { min = 0, max = 1 } = {}) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

function resolveAssistantConfig(ai = {}, requestedAssistantId = '') {
    const assistants = Array.isArray(ai?.assistants) ? ai.assistants : [];
    const requestedId = normalizeAssistantId(requestedAssistantId || '');

    const requested = requestedId
        ? assistants.find((entry) => String(entry?.assistantId || '').trim().toUpperCase() === requestedId && entry?.isActive !== false)
        : null;
    const defaultId = normalizeAssistantId(ai?.defaultAssistantId || '');
    const activeDefault = defaultId
        ? assistants.find((entry) => String(entry?.assistantId || '').trim().toUpperCase() === defaultId && entry?.isActive !== false)
        : null;
    const anyDefault = assistants.find((entry) => entry?.isDefault === true && entry?.isActive !== false);
    const activeFirst = assistants.find((entry) => entry?.isActive !== false);

    return requested || activeDefault || anyDefault || activeFirst || null;
}

async function getOpenAIConfig({ tenantId = 'default', moduleAssistantId = '' } = {}) {
    const integrations = await tenantIntegrationsService.getTenantIntegrations(tenantId, { runtime: true });
    const ai = integrations?.ai || {};
    const assistant = resolveAssistantConfig(ai, moduleAssistantId);

    const apiKeyRaw = assistant?.openaiApiKey || ai?.openaiApiKey || '';
    return {
        apiKey: sanitizeApiKey(apiKeyRaw),
        model: String(assistant?.model || ai?.model || 'gpt-4o-mini').trim() || 'gpt-4o-mini',
        temperature: normalizeAiNumber(assistant?.temperature, 0.7, { min: 0, max: 2 }),
        topP: normalizeAiNumber(assistant?.topP, 1, { min: 0, max: 1 }),
        maxTokens: Math.max(64, Math.min(4096, Number(assistant?.maxTokens || 800) || 800)),
        systemPrompt: String(assistant?.systemPrompt || '').trim() || null,
        assistantId: String(assistant?.assistantId || '').trim() || null,
        assistantName: String(assistant?.name || '').trim() || null
    };
}

function mapAiError(error) {
    const text = String(error?.message || error || '').toLowerCase();
    if (text.includes('api key')) {
        return 'Error IA: API Key invalida o ausente. Configurala en Panel SaaS > IA.';
    }
    if (text.includes('quota') || text.includes('rate limit') || text.includes('resource_exhausted') || error?.status === 429) {
        return 'Error IA: cuota/limite de OpenAI agotado. Revisa billing y limites de tu cuenta.';
    }
    if (text.includes('model') && text.includes('not found')) {
        return 'Error IA: modelo de OpenAI no disponible. Ajusta el modelo en Panel SaaS > IA.';
    }
    if (error?.status === 401) {
        return 'Error IA: autenticacion fallida con OpenAI (401). Revisa la API Key del tenant.';
    }
    if (error?.status === 403) {
        return 'Error IA: acceso denegado por OpenAI (403). Revisa permisos del proyecto.';
    }
    return 'Error IA: fallo al consultar OpenAI.';
}

async function requestOpenAI({ apiKey, model, temperature = 0.7, topP = 1, maxTokens = 800, messages = [] }) {
    const payloadMessages = Array.isArray(messages) && messages.length
        ? messages
        : [{ role: 'user', content: 'Sin instrucciones.' }];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            temperature,
            top_p: topP,
            max_tokens: maxTokens,
            messages: payloadMessages,
        }),
    });

    const payload = await response.json();
    if (!response.ok) {
        const err = new Error(payload?.error?.message || `OpenAI error ${response.status}`);
        err.status = response.status;
        throw err;
    }

    return payload?.choices?.[0]?.message?.content || '';
}

async function generateWithOpenAI(messages, config, onChunk = null) {
    const text = await requestOpenAI({ ...config, messages });
    if (onChunk && text) onChunk(text);
    return text;
}

function loadBaseBusinessContext() {
    const contextFilePath = path.join(__dirname, '../../../data/legacy/lavitat_context.txt');
    if (fs.existsSync(contextFilePath)) {
        return fs.readFileSync(contextFilePath, 'utf-8');
    }
    return 'Eres un asistente virtual de ventas amable.';
}

function buildBusinessContext(externalBusinessContext) {
    const baseContext = loadBaseBusinessContext();
    if (!externalBusinessContext) return baseContext;

    return `${baseContext}

--- CONTEXTO OPERATIVO EN TIEMPO REAL ---
${externalBusinessContext}`.trim();
}

/**
 * Genera sugerencia de respuesta para el cliente (SOPORTA STREAMING).
 */
async function getChatSuggestion(context, customPrompt = '', onChunk = null, externalBusinessContext = null, options = {}) {
    try {
        const config = await getOpenAIConfig({
            tenantId: options?.tenantId || 'default',
            moduleAssistantId: options?.moduleAssistantId || ''
        });
        if (!config.apiKey) {
            return 'IA no configurada. Falta OpenAI API Key para este tenant.';
        }

        const promptPackage = await buildAiPromptPackage({
            mode: 'chat_suggestion',
            tenantId: options?.tenantId || 'default',
            query: customPrompt || '',
            customPrompt: customPrompt || '',
            contextText: context || '',
            runtimeContext: options?.runtimeContext || null,
            moduleContext: options?.moduleContext || null
        });

        const legacyBusinessContext = externalBusinessContext
            ? `\n\nCONTEXTO LEGACY FRONTEND (usar solo como apoyo, sin sobreescribir contexto real):\n${clipText(String(externalBusinessContext || ''), 600)}`
            : '';
        const explicitUserInstruction = customPrompt.trim()
            ? `\n\nInstruccion puntual de la vendedora: ${customPrompt.trim()}`
            : '';

        const fallbackLegacyContext = !options?.runtimeContext && externalBusinessContext
            ? `\n\nCONTEXTO BASE LEGACY:\n${clipText(buildBusinessContext(externalBusinessContext), 900)}`
            : '';

        const composedSystemPrompt = [
            config.systemPrompt || '',
            promptPackage.dynamicSystemPrompt || ''
        ]
            .map((entry) => String(entry || '').trim())
            .filter(Boolean)
            .join('\n\n');

        const userPrompt = `${promptPackage.dynamicUserPrompt}${legacyBusinessContext}${fallbackLegacyContext}${explicitUserInstruction}

OBJETIVO DE ESTA EJECUCION:
- Generar una sola respuesta sugerida, lista para enviar al cliente por WhatsApp.
- Prioriza cierre comercial elegante y claro, sin inventar datos.`;

        return await generateWithOpenAI([
            { role: 'system', content: composedSystemPrompt },
            { role: 'user', content: userPrompt }
        ], config, onChunk);
    } catch (error) {
        console.error('Error al obtener sugerencia de IA:', error?.message || error);
        return mapAiError(error);
    }
}

/**
 * Responde consultas internas del vendedor (SOPORTA STREAMING).
 */
async function askInternalCopilot(query, onChunk = null, externalBusinessContext = null, options = {}) {
    try {
        const config = await getOpenAIConfig({
            tenantId: options?.tenantId || 'default',
            moduleAssistantId: options?.moduleAssistantId || ''
        });
        if (!config.apiKey) {
            return 'IA no configurada. Falta OpenAI API Key para este tenant.';
        }

        const promptPackage = await buildAiPromptPackage({
            mode: 'internal_copilot',
            tenantId: options?.tenantId || 'default',
            query: query || '',
            customPrompt: '',
            contextText: '',
            runtimeContext: options?.runtimeContext || null,
            moduleContext: options?.moduleContext || null
        });

        const legacyBusinessContext = externalBusinessContext
            ? `\n\nCONTEXTO LEGACY FRONTEND (usar solo como apoyo):\n${clipText(String(externalBusinessContext || ''), 600)}`
            : '';

        const fallbackLegacyContext = !options?.runtimeContext && externalBusinessContext
            ? `\n\nCONTEXTO BASE LEGACY:\n${clipText(buildBusinessContext(externalBusinessContext), 900)}`
            : '';

        const composedSystemPrompt = [
            config.systemPrompt || '',
            promptPackage.dynamicSystemPrompt || ''
        ]
            .map((entry) => String(entry || '').trim())
            .filter(Boolean)
            .join('\n\n');

        const userPrompt = `${promptPackage.dynamicUserPrompt}${legacyBusinessContext}${fallbackLegacyContext}

CONSULTA INTERNA DE LA VENDEDORA:
${String(query || '').trim() || '(sin consulta)'}

OBJETIVO DE ESTA EJECUCION:
- Resolver la consulta comercial de forma accionable.
- Entregar SIEMPRE 3 sugerencias de respuesta.
- Si aplica por contexto o carrito, entregar 3 cotizaciones separadas con formato limpio.`;

        return await generateWithOpenAI([
            { role: 'system', content: composedSystemPrompt },
            { role: 'user', content: userPrompt }
        ], config, onChunk);
    } catch (error) {
        console.error('Error en Copiloto Interno:', error?.message || error);
        return mapAiError(error);
    }
}

module.exports = {
    getChatSuggestion,
    askInternalCopilot
};

