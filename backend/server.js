const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { URL } = require('url');
require('dotenv').config({ quiet: true });
const logger = require('./logger');
const { parseCsvEnv, resolveAndValidatePublicHost } = require('./security_utils');

const waClient = require('./wa_provider');
const SocketManager = require('./socket_manager');

const app = express();
app.use(express.json({ limit: '1mb' }));

const allowedOrigins = parseCsvEnv(process.env.ALLOWED_ORIGINS);
app.use(cors({
    origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
    }
}));

const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e8, // 100MB
    cors: {
        origin: allowedOrigins.length ? allowedOrigins : '*',
        methods: ["GET", "POST"]
    }
});

let socketAuthBypassLogged = false;
io.use((socket, next) => {
    const expectedToken = process.env.SOCKET_AUTH_TOKEN || '';
    if (!expectedToken) {
        if (!socketAuthBypassLogged) {
            logger.info('SOCKET_AUTH_TOKEN not configured; Socket.IO auth is bypassed.');
            socketAuthBypassLogged = true;
        }
        return next();
    }

    const token = socket.handshake?.auth?.token || socket.handshake?.headers?.authorization?.replace(/^Bearer\s+/i, '');
    if (token && token === expectedToken) return next();
    return next(new Error('Unauthorized'));
});

// Initialize Managers
const socketManager = new SocketManager(io);

// Basic Route
app.get('/', (req, res) => {
    res.send('WhatsApp Business API V4 - Robust & Modular');
});

const PROFILE_PHOTO_ALLOWED_HOST_SUFFIXES = ['whatsapp.net', 'fbcdn.net', 'fbsbx.com'];

function isAllowedProfilePhotoHost(hostname = '') {
    const host = String(hostname || '').trim().toLowerCase();
    if (!host) return false;
    return PROFILE_PHOTO_ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

app.get('/api/profile-photo', async (req, res) => {
    const rawUrl = String(req.query.url || '').trim();
    if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) {
        return res.status(400).json({ error: 'URL de foto invalida. Usa http(s).' });
    }

    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch (error) {
        return res.status(400).json({ error: 'URL de foto invalida.' });
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        return res.status(400).json({ error: 'Solo se permiten protocolos http/https.' });
    }

    if (!isAllowedProfilePhotoHost(parsed.hostname)) {
        return res.status(403).json({ error: 'Host de imagen no permitido.' });
    }

    try {
        await resolveAndValidatePublicHost(parsed.hostname);

        const timeoutMs = Number(process.env.PROFILE_PHOTO_TIMEOUT_MS || 5000);
        const maxBytes = Number(process.env.PROFILE_PHOTO_MAX_BYTES || 2 * 1024 * 1024);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        let response;
        try {
            response = await fetch(parsed.toString(), {
                redirect: 'follow',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (WhatsApp Business Pro Photo Proxy)'
                },
                signal: controller.signal
            });
        } finally {
            clearTimeout(timeout);
        }

        if (!response.ok) {
            return res.status(response.status).json({ error: 'No se pudo descargar la foto de perfil.' });
        }

        const contentType = String(response.headers.get('content-type') || '').toLowerCase();
        if (!contentType.startsWith('image/')) {
            return res.status(415).json({ error: 'El recurso no es una imagen.' });
        }

        const contentLength = Number(response.headers.get('content-length') || 0);
        if (contentLength && contentLength > maxBytes) {
            return res.status(413).json({ error: 'La imagen excede el tamano permitido.' });
        }

        const imageBuffer = Buffer.from(await response.arrayBuffer());
        if (imageBuffer.length > maxBytes) {
            return res.status(413).json({ error: 'La imagen excede el tamano permitido.' });
        }

        res.setHeader('Content-Type', contentType.split(';')[0] || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=300');
        return res.send(imageBuffer);
    } catch (error) {
        return res.status(502).json({ error: 'No se pudo cargar la foto de perfil.' });
    }
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

function parseMapCoordinates(value = '') {
    const source = String(value || '');
    if (!source) return null;

    const patterns = [
        /@(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/i,
        /[?&](?:q|query|ll|sll|destination|daddr)=(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/i,
        /\b(-?\d{1,2}\.\d{4,})\s*,\s*(-?\d{1,3}\.\d{4,})\b/
    ];

    for (const pattern of patterns) {
        const match = source.match(pattern);
        if (!match) continue;
        const latitude = Number.parseFloat(match[1]);
        const longitude = Number.parseFloat(match[2]);
        if (Number.isFinite(latitude) && Number.isFinite(longitude)
            && latitude >= -90 && latitude <= 90
            && longitude >= -180 && longitude <= 180) {
            return { latitude, longitude };
        }
    }

    return null;
}

function normalizeMapSeedFromUrl(rawUrl = '') {
    const value = String(rawUrl || '').trim();
    if (!value) return '';

    let parsed;
    try {
        parsed = new URL(value);
    } catch (error) {
        return value;
    }

    for (const key of ['q', 'query', 'll', 'sll', 'destination', 'daddr']) {
        const fromParam = String(parsed.searchParams.get(key) || '').trim();
        if (!fromParam) continue;
        const coords = parseMapCoordinates(fromParam);
        if (coords) return `${coords.latitude},${coords.longitude}`;
        return fromParam;
    }

    const decodedPath = decodeURIComponent(`${parsed.pathname || ''}${parsed.hash || ''}`);
    const pathCoords = parseMapCoordinates(decodedPath);
    if (pathCoords) return `${pathCoords.latitude},${pathCoords.longitude}`;

    const placeMatch = decodedPath.match(/\/place\/([^/]+)/i);
    if (placeMatch?.[1]) return String(placeMatch[1]).replace(/\+/g, ' ');

    const searchMatch = decodedPath.match(/\/search\/([^/]+)/i);
    if (searchMatch?.[1]) return String(searchMatch[1]).replace(/\+/g, ' ');

    return value;
}

function isAllowedMapHost(hostname = '') {
    const host = String(hostname || '').trim().toLowerCase();
    if (!host) return false;

    if (host === 'maps.app.goo.gl') return true;
    if (host === 'goo.gl') return true;
    if (host === 'maps.google.com') return true;
    if (host.startsWith('maps.google.')) return true;
    if (host === 'www.google.com') return true;
    if (host.startsWith('www.google.')) return true;
    if (host.startsWith('m.google.')) return true;

    return false;
}

app.get('/api/link-preview', async (req, res) => {
    const url = String(req.query.url || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) {
        return res.status(400).json({ error: 'URL invalida. Usa http(s).' });
    }

    try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return res.status(400).json({ error: 'Solo se permiten protocolos http/https.' });
        }

        const blockedHosts = new Set(parseCsvEnv(process.env.LINK_PREVIEW_BLOCKED_HOSTS));
        if (blockedHosts.has(parsed.hostname)) {
            return res.status(403).json({ ok: false, url, error: 'Host bloqueado.' });
        }

        await resolveAndValidatePublicHost(parsed.hostname);

        const timeoutMs = Number(process.env.LINK_PREVIEW_TIMEOUT_MS || 5000);
        const maxBytes = Number(process.env.LINK_PREVIEW_MAX_BYTES || 1024 * 1024);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(url, {
            redirect: 'follow',
            headers: {
                'User-Agent': 'Mozilla/5.0 (WhatsApp Business Pro Preview Bot)'
            },
            signal: controller.signal
        });
        clearTimeout(timeout);

        const contentType = String(response.headers.get('content-type') || '').toLowerCase();
        if (!contentType.includes('text/html')) {
            return res.status(415).json({ ok: false, url, error: 'La URL no contiene HTML previsualizable.' });
        }

        const contentLength = Number(response.headers.get('content-length') || 0);
        if (contentLength && contentLength > maxBytes) {
            return res.status(413).json({ ok: false, url, error: 'El contenido excede el tamano permitido para preview.' });
        }

        const html = (await response.text()).slice(0, maxBytes);
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

app.get('/api/map-resolve', async (req, res) => {
    const rawUrl = String(req.query.url || '').trim();
    if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) {
        return res.status(400).json({ ok: false, error: 'URL de mapa invalida.' });
    }

    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch (error) {
        return res.status(400).json({ ok: false, error: 'URL de mapa invalida.' });
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        return res.status(400).json({ ok: false, error: 'Solo se permiten protocolos http/https.' });
    }

    if (!isAllowedMapHost(parsed.hostname)) {
        return res.status(403).json({ ok: false, error: 'Host de mapa no permitido.' });
    }

    try {
        await resolveAndValidatePublicHost(parsed.hostname);

        const timeoutMs = Number(process.env.MAP_RESOLVE_TIMEOUT_MS || 6000);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        let response;
        try {
            response = await fetch(parsed.toString(), {
                redirect: 'follow',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (WhatsApp Business Pro Map Resolver)'
                },
                signal: controller.signal
            });
        } finally {
            clearTimeout(timeout);
        }

        const resolvedUrl = String(response?.url || parsed.toString());
        const seed = normalizeMapSeedFromUrl(resolvedUrl);
        const coords = parseMapCoordinates(seed) || parseMapCoordinates(resolvedUrl);

        return res.json({
            ok: true,
            inputUrl: parsed.toString(),
            resolvedUrl,
            seed,
            latitude: coords?.latitude ?? null,
            longitude: coords?.longitude ?? null
        });
    } catch (error) {
        return res.status(502).json({
            ok: false,
            error: error?.message || 'No se pudo resolver el enlace de mapa.'
        });
    }
});

app.get('/api/map-suggest', async (req, res) => {
    const query = String(req.query.q || '').trim();
    if (query.length < 2) {
        return res.json({ ok: true, items: [] });
    }

    try {
        const timeoutMs = Number(process.env.MAP_SUGGEST_TIMEOUT_MS || 7000);
        const limit = Math.min(10, Math.max(3, Number.parseInt(String(req.query.limit || '8'), 10) || 8));

        const nominatimUrl = new URL('https://nominatim.openstreetmap.org/search');
        nominatimUrl.searchParams.set('format', 'jsonv2');
        nominatimUrl.searchParams.set('addressdetails', '1');
        nominatimUrl.searchParams.set('limit', String(limit));
        nominatimUrl.searchParams.set('q', query);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        let response;
        try {
            response = await fetch(nominatimUrl.toString(), {
                headers: {
                    'User-Agent': 'WhatsApp Business Pro/1.0 (map-suggest)'
                },
                signal: controller.signal
            });
        } finally {
            clearTimeout(timeout);
        }

        if (!response.ok) {
            return res.status(502).json({ ok: false, error: 'No se pudo obtener sugerencias de ubicacion.', items: [] });
        }

        const payload = await response.json();
        const rows = Array.isArray(payload) ? payload : [];
        const items = rows
            .map((row) => {
                const latitude = Number.parseFloat(String(row?.lat || ''));
                const longitude = Number.parseFloat(String(row?.lon || ''));
                const label = String(row?.display_name || '').trim();
                if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !label) return null;
                return {
                    id: String(row?.place_id || `${latitude},${longitude}`),
                    label,
                    latitude,
                    longitude,
                    mapUrl: `https://www.google.com/maps?q=${latitude},${longitude}`
                };
            })
            .filter(Boolean)
            .slice(0, limit);

        return res.json({ ok: true, items });
    } catch (error) {
        return res.status(500).json({
            ok: false,
            error: error?.message || 'Error consultando sugerencias de ubicacion.',
            items: []
        });
    }
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    const runtime = typeof waClient.getRuntimeInfo === 'function'
        ? waClient.getRuntimeInfo()
        : { requestedTransport: 'webjs', activeTransport: 'webjs', cloudConfigured: false };
    logger.info(`[WA] transport requested=${runtime.requestedTransport} active=${runtime.activeTransport} cloudConfigured=${runtime.cloudConfigured}`);
    waClient.initialize();
});

