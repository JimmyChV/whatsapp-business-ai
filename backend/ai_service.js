require('dotenv').config();
const fs = require('fs');
const path = require('path');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || null;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function mapAiError(error) {
    const text = String(error?.message || error || '').toLowerCase();
    if (text.includes('api key')) {
        return 'Error IA: OPENAI_API_KEY inválida o ausente. Actualiza tu .env y reinicia backend.';
    }
    if (text.includes('quota') || text.includes('rate limit') || text.includes('resource_exhausted') || error?.status === 429) {
        return 'Error IA: cuota/límite de OpenAI agotado. Revisa billing y límites de tu cuenta.';
    }
    if (text.includes('model') && text.includes('not found')) {
        return 'Error IA: modelo de OpenAI no disponible. Ajusta OPENAI_MODEL en tu .env.';
    }
    return 'Error IA: fallo al consultar OpenAI.';
}

async function requestOpenAI(prompt) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
            model: OPENAI_MODEL,
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

async function generateWithOpenAI(prompt, onChunk = null) {
    const text = await requestOpenAI(prompt);
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
 * Genera una sugerencia de respuesta para el cliente basada en el contexto de la conversación (SOPORTA STREAMING).
 */
async function getChatSuggestion(context, customPrompt = '', onChunk = null, externalBusinessContext = null) {
    try {
        if (!OPENAI_API_KEY) {
            return 'IA no configurada. Falta OPENAI_API_KEY.';
        }

        const businessContext = buildBusinessContext(externalBusinessContext);

        const customInstructionText = customPrompt.trim() !== ''
            ? `\n\nATENCIÓN: EL VENDEDOR TE HA DADO UNA INSTRUCCIÓN ESPECÍFICA:\n"${customPrompt}"\nPOR FAVOR, PRIORIZA ESTA INSTRUCCIÓN.`
            : '';

        const prompt = `${businessContext}

CONVERSACIÓN RECIENTE:
---
${context}
---${customInstructionText}

REGLAS CRÍTICAS DE PRECISIÓN DE CATÁLOGO:
- Nunca inventes productos, presentaciones, tamaños ni precios.
- Solo usa productos y precios que aparezcan literalmente en el contexto.
- Si falta un dato exacto, responde que lo confirmarás antes de cotizar.

Genera la respuesta sugerida que el negocio debería enviar. Texto directo, sin comillas.`;

        return await generateWithOpenAI(prompt, onChunk);
    } catch (error) {
        console.error('Error al obtener sugerencia de IA:', error?.message || error);
        return mapAiError(error);
    }
}

/**
 * Responde consultas internas del vendedor sobre el inventario y negocio (SOPORTA STREAMING).
 */
async function askInternalCopilot(query, onChunk = null, externalBusinessContext = null) {
    try {
        if (!OPENAI_API_KEY) {
            return 'IA no configurada. Falta OPENAI_API_KEY.';
        }

        const businessContext = buildBusinessContext(externalBusinessContext);

        const prompt = `${businessContext}

INSTRUCCIÓN: Eres el copiloto interno. Ayuda al dueño con stock y opciones (sugiere 3 siempre). 
CONSULTA: "${query}"

REGLAS CRÍTICAS:
- No inventar nombres ni precios.
- Cuando recomiendes, citar el nombre exacto del catálogo.
- Si hay duda de presentación/capacidad, pedir confirmación antes de cotizar.`;

        return await generateWithOpenAI(prompt, onChunk);
    } catch (error) {
        console.error('Error en Copiloto Interno:', error?.message || error);
        return mapAiError(error);
    }
}

module.exports = {
    getChatSuggestion,
    askInternalCopilot
};
