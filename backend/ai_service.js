require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');

let ai = null;
if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI(process.env.GEMINI_API_KEY);
}

/**
 * Genera una sugerencia de respuesta para el cliente basada en el contexto de la conversación (SOPORTA STREAMING).
 */
async function getChatSuggestion(context, customPrompt = "", onChunk = null, externalBusinessContext = null) {
    try {
        if (!ai) {
            return "IA no configurada.";
        }

        const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });

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

        if (onChunk) {
            // Modo Streaming
            const result = await model.generateContentStream(prompt);
            let fullText = "";
            for await (const chunk of result.stream) {
                const chunkText = chunk.text();
                fullText += chunkText;
                onChunk(chunkText);
            }
            return fullText;
        } else {
            // Modo Bloqueante
            const result = await model.generateContent(prompt);
            return result.response.text();
        }
    } catch (error) {
        console.error("Error al obtener sugerencia de IA:", error);
        return "Error al procesar con IA.";
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

        const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });

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

        if (onChunk) {
            const result = await model.generateContentStream(prompt);
            let fullText = "";
            for await (const chunk of result.stream) {
                const chunkText = chunk.text();
                fullText += chunkText;
                onChunk(chunkText);
            }
            return fullText;
        } else {
            const result = await model.generateContent(prompt);
            return result.response.text();
        }
    } catch (error) {
        console.error("Error en Copiloto Interno:", error);
        return "Error al consultar al copiloto.";
    }
}

module.exports = {
    getChatSuggestion,
    askInternalCopilot
};
