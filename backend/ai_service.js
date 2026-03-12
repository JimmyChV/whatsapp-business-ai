const fs = require('fs');
const path = require('path');
const tenantIntegrationsService = require('./tenant_integrations_service');

function sanitizeApiKey(value = '') {
    return String(value || '')
        .trim()
        .replace(/^["']|["']$/g, '')
        .replace(/\s+/g, '');
}

async function getOpenAIConfig({ tenantId = 'default' } = {}) {
    const integrations = await tenantIntegrationsService.getTenantIntegrations(tenantId, { runtime: true });
    return {
        apiKey: sanitizeApiKey(integrations?.ai?.openaiApiKey || ''),
        model: String(integrations?.ai?.model || 'gpt-4o-mini').trim() || 'gpt-4o-mini'
    };
}

function mapAiError(error) {
    const text = String(error?.message || error || '').toLowerCase();
    if (text.includes('api key')) {
        return 'Error IA: API Key invalida o ausente. Configurala en Panel SaaS > Configuracion.';
    }
    if (text.includes('quota') || text.includes('rate limit') || text.includes('resource_exhausted') || error?.status === 429) {
        return 'Error IA: cuota/limite de OpenAI agotado. Revisa billing y limites de tu cuenta.';
    }
    if (text.includes('model') && text.includes('not found')) {
        return 'Error IA: modelo de OpenAI no disponible. Ajusta el modelo en Panel SaaS > Configuracion.';
    }
    if (error?.status === 401) {
        return 'Error IA: autenticacion fallida con OpenAI (401). Revisa la API Key del tenant.';
    }
    if (error?.status === 403) {
        return 'Error IA: acceso denegado por OpenAI (403). Revisa permisos del proyecto.';
    }
    return 'Error IA: fallo al consultar OpenAI.';
}

async function requestOpenAI(prompt, { apiKey, model }) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            temperature: 0.7,
            messages: [{ role: 'user', content: prompt }],
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

async function generateWithOpenAI(prompt, config, onChunk = null) {
    const text = await requestOpenAI(prompt, config);
    if (onChunk && text) onChunk(text);
    return text;
}

function loadBaseBusinessContext() {
    const contextFilePath = path.join(__dirname, 'lavitat_context.txt');
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
        const config = await getOpenAIConfig({ tenantId: options?.tenantId || 'default' });
        if (!config.apiKey) {
            return 'IA no configurada. Falta OpenAI API Key para este tenant.';
        }

        const businessContext = buildBusinessContext(externalBusinessContext);

        const customInstructionText = customPrompt.trim() !== ''
            ? `\n\nATENCION: EL VENDEDOR TE HA DADO UNA INSTRUCCION ESPECIFICA:\n"${customPrompt}"\nPOR FAVOR, PRIORIZA ESTA INSTRUCCION.`
            : '';

        const prompt = `${businessContext}

CONVERSACION RECIENTE:
---
${context}
---${customInstructionText}

REGLAS CRITICAS DE PRECISION DE CATALOGO:
- Nunca inventes productos, presentaciones, tamanos ni precios.
- Solo usa productos y precios que aparezcan literalmente en el contexto.
- Si falta un dato exacto, responde que lo confirmaras antes de cotizar.

Genera la respuesta sugerida que el negocio deberia enviar. Texto directo, sin comillas.`;

        return await generateWithOpenAI(prompt, config, onChunk);
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
        const config = await getOpenAIConfig({ tenantId: options?.tenantId || 'default' });
        if (!config.apiKey) {
            return 'IA no configurada. Falta OpenAI API Key para este tenant.';
        }

        const businessContext = buildBusinessContext(externalBusinessContext);

        const prompt = `${businessContext}

INSTRUCCION: Eres el copiloto interno. Ayuda al dueno con stock y opciones (sugiere 3 siempre).
CONSULTA: "${query}"

REGLAS CRITICAS:
- No inventar nombres ni precios.
- Cuando recomiendes, citar el nombre exacto del catalogo.
- Si hay duda de presentacion/capacidad, pedir confirmacion antes de cotizar.`;

        return await generateWithOpenAI(prompt, config, onChunk);
    } catch (error) {
        console.error('Error en Copiloto Interno:', error?.message || error);
        return mapAiError(error);
    }
}

module.exports = {
    getChatSuggestion,
    askInternalCopilot
};
