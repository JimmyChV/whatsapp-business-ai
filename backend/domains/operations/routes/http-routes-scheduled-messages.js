const scheduledMessagesServiceDefault = require('../services/scheduled-messages.service');

function ensureAuthenticated(req, res, authService) {
    if (authService?.isAuthEnabled?.() && !req?.authContext?.isAuthenticated) {
        res.status(401).json({ ok: false, error: 'No autenticado.' });
        return false;
    }
    return true;
}

function resolveTenantIdFromContext(req) {
    const tenantId = String(req?.authContext?.user?.tenantId || req?.tenantContext?.id || '').trim();
    return tenantId && tenantId !== 'default' ? tenantId : null;
}

function resolveActorUserId(req) {
    return String(req?.authContext?.user?.userId || req?.authContext?.user?.id || '').trim() || null;
}

function registerOperationsScheduledMessagesHttpRoutes({
    app,
    authService,
    scheduledMessagesService = scheduledMessagesServiceDefault
}) {
    if (!app) throw new Error('registerOperationsScheduledMessagesHttpRoutes requiere app.');

    app.get('/api/tenant/scheduled-messages', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenantId = resolveTenantIdFromContext(req);
            if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
            const items = await scheduledMessagesService.listScheduledMessages(tenantId, {
                chatId: req.query?.chatId || '',
                scopeModuleId: req.query?.scopeModuleId || '',
                limit: req.query?.limit || 50
            });
            return res.json({ ok: true, tenantId, items });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudieron cargar mensajes programados.') });
        }
    });

    app.get('/api/tenant/scheduled-messages/counts', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenantId = resolveTenantIdFromContext(req);
            if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
            const items = await scheduledMessagesService.listScheduledMessageCounts(tenantId);
            return res.json({ ok: true, tenantId, items });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudieron cargar conteos programados.') });
        }
    });

    app.post('/api/tenant/scheduled-messages', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenantId = resolveTenantIdFromContext(req);
            if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
            const actorUserId = resolveActorUserId(req);
            const item = await scheduledMessagesService.createScheduledMessage(tenantId, {
                ...(req.body || {}),
                createdByUserId: actorUserId
            });
            return res.status(201).json({ ok: true, tenantId, item });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo programar el mensaje.') });
        }
    });

    app.patch('/api/tenant/scheduled-messages/:messageId', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenantId = resolveTenantIdFromContext(req);
            if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
            const item = await scheduledMessagesService.updateScheduledMessage(tenantId, req.params?.messageId || '', req.body || {});
            if (!item) return res.status(404).json({ ok: false, error: 'Mensaje programado no encontrado.' });
            return res.json({ ok: true, tenantId, item });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar el mensaje programado.') });
        }
    });

    app.delete('/api/tenant/scheduled-messages/:messageId', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenantId = resolveTenantIdFromContext(req);
            if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
            const item = await scheduledMessagesService.cancelScheduledMessage(tenantId, req.params?.messageId || '', 'manual');
            if (!item) return res.status(404).json({ ok: false, error: 'Mensaje programado no encontrado o ya procesado.' });
            return res.json({ ok: true, tenantId, item });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo cancelar el mensaje programado.') });
        }
    });
}

module.exports = {
    registerOperationsScheduledMessagesHttpRoutes
};
