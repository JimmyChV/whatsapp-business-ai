const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const waClient = require('./whatsapp_client');
const logger = require('./logger');


function assertNoMergeMarkersInBackend() {
    const backendDir = __dirname;
    const jsFiles = fs.readdirSync(backendDir).filter((file) => file.endsWith('.js'));
    const markerRegex = /^(<<<<<<<|=======|>>>>>>> )/m;

    for (const file of jsFiles) {
        const fullPath = path.join(backendDir, file);
        const content = fs.readFileSync(fullPath, 'utf8');
        if (markerRegex.test(content)) {
            throw new Error(`Se detectaron marcadores de conflicto Git en ${file}. Resuelve los conflictos antes de iniciar el servidor.`);
        }
    }
}

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e8, // 100MB
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Initialize Managers
assertNoMergeMarkersInBackend();
const SocketManager = require('./socket_manager');
const socketManager = new SocketManager(io);

// Basic Route
app.get('/', (req, res) => {
    res.send('WhatsApp Business API V4 - Robust & Modular');
});

function extractMeta(html, property, nameFallback = null) {
    const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const byProperty = new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i').exec(html);
    if (byProperty?.[1]) return byProperty[1];
    if (nameFallback) {
        const escapedName = nameFallback.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const byName = new RegExp(`<meta[^>]+name=["']${escapedName}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i').exec(html);
        if (byName?.[1]) return byName[1];
    }
    return null;
}

app.get('/api/link-preview', async (req, res) => {
    const url = String(req.query.url || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) {
        return res.status(400).json({ error: 'URL inválida. Usa http(s).' });
    }

    try {
        const response = await fetch(url, {
            redirect: 'follow',
            headers: {
                'User-Agent': 'Mozilla/5.0 (WhatsApp Business Pro Preview Bot)'
            }
        });

        const html = await response.text();
        const title = extractMeta(html, 'og:title') || (/<title>([^<]+)<\/title>/i.exec(html)?.[1] || null);
        const description = extractMeta(html, 'og:description', 'description');
        const image = extractMeta(html, 'og:image');
        const siteName = extractMeta(html, 'og:site_name');

        return res.json({
            url,
            ok: true,
            title,
            description,
            image,
            siteName
        });
    } catch (error) {
        return res.status(500).json({
            ok: false,
            url,
            error: error.message || 'No se pudo generar vista previa del enlace.'
        });
    }
});


const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    waClient.initialize();
});
