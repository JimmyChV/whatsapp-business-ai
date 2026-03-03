require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');

let ai = null;
if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

const MODEL_CANDIDATES = [
    process.env.GEMINI_MODEL,
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash'
].filter(Boolean);

function shouldTryNextModel(error) {
    return error?.status === 404 || String(error?.message || '').includes('is not found');
}

function mapAiError(error) {
    const text = String(error?.message || error || '').toLowerCase();
    if (text.includes('api_key_invalid') || text.includes('api key not valid')) {
        return 'Error IA: GEMINI_API_KEY inválida. Actualiza tu .env y reinicia backend.';
    }
    if (text.includes('is not found') || error?.status === 404) {
        return 'Error IA: modelo Gemini no disponible para esta cuenta/API. Ajusta GEMINI_MODEL en .env.';
    }
    return 'Error IA: fallo al consultar Gemini.';
}

async function generateWithFallback(prompt, onChunk = null) {
    let lastError = null;

    for (const model of MODEL_CANDIDATES) {
        try {
            if (onChunk) {
                const stream = await ai.models.generateContentStream({ model, contents: prompt });
                let fullText = '';
                for await (const chunk of stream) {
                    const chunkText = chunk.text || '';
                    fullText += chunkText;
                    onChunk(chunkText);
                }
                return fullText;
            }

            const result = await ai.models.generateContent({ model, contents: prompt });
            return result.text;
        } catch (error) {
            lastError = error;
            console.error(`[AI] Model ${model} failed:`, error?.message || error);
            if (!shouldTryNextModel(error)) break;
        }
    }

    throw lastError || new Error('No Gemini model available');
}

/**
 * Genera una sugerencia de respuesta para el cliente basada en el contexto de la conversación (SOPORTA STREAMING).
 */
async function getChatSuggestion(context, customPrompt = "", onChunk = null, externalBusinessContext = null) {
    try {
        if (!ai) {
            return "IA no configurada.";
        }

        let businessContext = "Eres un asistente virtual de ventas amable.";
        if (externalBusinessContext) {
            businessContext = externalBusinessContext;
        } else {
            const contextFilePath = path.join(__dirname, 'lavitat_context.txt');
            if (fs.existsSync(contextFilePath)) {
                businessContext = fs.readFileSync(contextFilePath, 'utf-8');
            }
        }

        const customInstructionText = customPrompt.trim() !== ""
            ? `\n\nATENCIÓN: EL VENDEDOR TE HA DADO UNA INSTRUCCIÓN ESPECÍFICA:\n"${customPrompt}"\nPOR FAVOR, PRIORIZA ESTA INSTRUCCIÓN.`
            : "";

        const prompt = `${businessContext}

CONVERSACIÓN RECIENTE:
---
${context}
---${customInstructionText}

Genera la respuesta sugerida que el negocio debería enviar. Texto directo, sin comillas.`;

        return await generateWithFallback(prompt, onChunk);
    } catch (error) {
        console.error("Error al obtener sugerencia de IA:", error?.message || error);
        return mapAiError(error);
    }
}

/**
 * Responde consultas internas del vendedor sobre el inventario y negocio (SOPORTA STREAMING).
 */
async function askInternalCopilot(query, onChunk = null, externalBusinessContext = null) {
    try {
        if (!ai) {
            return "IA no configurada.";
        }

        let businessContext = "";
        if (externalBusinessContext) {
            businessContext = externalBusinessContext;
        } else {
            const contextFilePath = path.join(__dirname, 'lavitat_context.txt');
            if (fs.existsSync(contextFilePath)) {
                businessContext = fs.readFileSync(contextFilePath, 'utf-8');
            }
        }

        const prompt = `${businessContext}

INSTRUCCIÓN: Eres el copiloto interno. Ayuda al dueño con stock y opciones (sugiere 3 siempre). 
CONSULTA: "${query}"`;

        return await generateWithFallback(prompt, onChunk);
    } catch (error) {
        console.error("Error en Copiloto Interno:", error?.message || error);
        return mapAiError(error);
    }
}

module.exports = {
    getChatSuggestion,
    askInternalCopilot
};
