function registerSecurityPushHttpRoutes({
    app,
    authService,
    pushNotificationService,
} = {}) {
    if (!app) throw new Error('registerSecurityPushHttpRoutes requiere app.');
    if (!authService) throw new Error('registerSecurityPushHttpRoutes requiere authService.');
    if (!pushNotificationService) throw new Error('registerSecurityPushHttpRoutes requiere pushNotificationService.');

    function requireAuth(req, res) {
        if (!authService.isAuthEnabled || !authService.isAuthEnabled()) return true;
        if (req?.authContext?.isAuthenticated && req?.authContext?.user) return true;
        res.status(401).json({ ok: false, error: 'No autenticado.' });
        return false;
    }

    function parseCookies(req = {}) {
        return String(req.headers?.cookie || '').split(';').reduce((acc, part) => {
            const index = part.indexOf('=');
            if (index <= 0) return acc;
            const key = decodeURIComponent(part.slice(0, index).trim());
            const value = decodeURIComponent(part.slice(index + 1).trim());
            if (key) acc[key] = value;
            return acc;
        }, {});
    }

    function getUserId(req = {}) {
        return String(req?.authContext?.user?.userId || req?.authContext?.user?.id || '').trim();
    }

    function getTenantId(req = {}) {
        const tenantId = String(req?.authContext?.user?.tenantId || req?.tenantContext?.id || '').trim();
        return tenantId && tenantId !== 'default' ? tenantId : '';
    }

    app.post('/api/push/subscribe', async (req, res) => {
        if (!requireAuth(req, res)) return;
        const userId = getUserId(req);
        const tenantId = getTenantId(req);
        const subscription = req.body?.subscription || {};
        const endpoint = String(subscription?.endpoint || '').trim();
        const p256dh = String(subscription?.keys?.p256dh || '').trim();
        const authKey = String(subscription?.keys?.auth || '').trim();
        const deviceId = String(parseCookies(req).saas_device_id || req.body?.deviceId || '').trim();
        const deviceType = String(req.body?.deviceType || req?.authContext?.user?.deviceType || '').trim();

        if (!userId || !tenantId) return res.status(400).json({ ok: false, error: 'Sesion invalida.' });
        if (!endpoint || !p256dh || !authKey) return res.status(400).json({ ok: false, error: 'Suscripcion push incompleta.' });

        try {
            const result = await pushNotificationService.saveSubscription({
                userId,
                tenantId,
                deviceId,
                endpoint,
                p256dh,
                authKey,
                deviceType,
            });
            return res.json({ ok: true, ...result });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo guardar la suscripcion push.') });
        }
    });

    app.delete('/api/push/unsubscribe', async (req, res) => {
        if (!requireAuth(req, res)) return;
        const userId = getUserId(req);
        const endpoint = String(req.body?.endpoint || '').trim();
        if (!userId || !endpoint) return res.status(400).json({ ok: false, error: 'Solicitud incompleta.' });

        try {
            const result = await pushNotificationService.deactivateSubscription({ userId, endpoint });
            return res.json({ ok: true, ...result });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo desactivar la suscripcion push.') });
        }
    });
}

module.exports = {
    registerSecurityPushHttpRoutes,
};
