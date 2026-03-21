function registerOperationsHealthHttpRoutes({
    app,
    hasOpsAccess,
    waClient,
    opsTelemetry,
    tenantService,
    authService,
    opsReadyRequireWa
}) {
    if (!app) throw new Error('registerOperationsHealthHttpRoutes requiere app.');

    app.get('/', (req, res) => {
        res.send('WhatsApp Business API V4 - Robust & Modular');
    });

    app.get('/api/ops/health', (req, res) => {
        if (!hasOpsAccess(req)) return res.status(401).json({ ok: false, error: 'No autorizado para operacion.' });
        const runtime = typeof waClient.getRuntimeInfo === 'function'
            ? waClient.getRuntimeInfo()
            : { requestedTransport: 'idle', activeTransport: 'idle' };

        return res.json({
            ok: true,
            requestId: req.requestId || null,
            now: new Date().toISOString(),
            uptimeSec: Math.max(0, Math.floor(process.uptime())),
            runtime,
            waReady: Boolean(waClient.isReady)
        });
    });

    app.get('/api/ops/ready', (req, res) => {
        if (!hasOpsAccess(req)) return res.status(401).json({ ok: false, error: 'No autorizado para operacion.' });

        const runtime = typeof waClient.getRuntimeInfo === 'function'
            ? waClient.getRuntimeInfo()
            : { requestedTransport: 'idle', activeTransport: 'idle' };
        const waReady = Boolean(waClient.isReady);
        const ready = opsReadyRequireWa ? waReady : true;

        return res.status(ready ? 200 : 503).json({
            ok: ready,
            requestId: req.requestId || null,
            ready,
            checks: {
                process: true,
                wa: waReady,
                waReady,
                waRequired: Boolean(opsReadyRequireWa)
            },
            runtime
        });
    });

    app.get('/api/ops/metrics', (req, res) => {
        if (!hasOpsAccess(req)) return res.status(401).json({ ok: false, error: 'No autorizado para operacion.' });

        const runtime = typeof waClient.getRuntimeInfo === 'function'
            ? waClient.getRuntimeInfo()
            : { requestedTransport: 'idle', activeTransport: 'idle' };
        const snapshot = opsTelemetry.buildSnapshot({
            waRuntime: runtime,
            waReady: Boolean(waClient.isReady),
            saasEnabled: tenantService.isSaasEnabled(),
            authEnabled: authService.isAuthEnabled()
        });

        return res.json({ ok: true, requestId: req.requestId || null, ...snapshot });
    });
}

module.exports = {
    registerOperationsHealthHttpRoutes
};
