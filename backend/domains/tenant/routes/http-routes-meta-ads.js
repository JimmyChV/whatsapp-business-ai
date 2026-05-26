const metaAdsSyncService = require('../services/meta-ads-sync.service');

function registerTenantMetaAdsHttpRoutes({
    app,
    accessPolicyService,
    isTenantAllowedForUser,
    hasPermission,
    hasAnyPermission
}) {
    if (!app) throw new Error('registerTenantMetaAdsHttpRoutes requiere app.');

    app.get('/api/meta-ads/insights', async (req, res) => {
        const tenantId = String(req.query?.tenantId || '').trim();
        const dateStart = String(req.query?.dateStart || '').trim();
        const dateStop = String(req.query?.dateStop || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!dateStart || !dateStop) return res.status(400).json({ ok: false, error: 'dateStart y dateStop son obligatorios.' });
        if (!isTenantAllowedForUser(req, tenantId)
            || !hasAnyPermission(req, [
                accessPolicyService.PERMISSIONS.TENANT_META_ADS_READ,
                accessPolicyService.PERMISSIONS.TENANT_META_ADS_MANAGE
            ])) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const items = await metaAdsSyncService.listMetaAdsInsights(tenantId, { dateStart, dateStop });
            return res.json({ ok: true, tenantId, dateStart, dateStop, items });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudieron cargar insights de Meta Ads.') });
        }
    });

    app.post('/api/meta-ads/sync', async (req, res) => {
        const source = req.body && typeof req.body === 'object' ? req.body : req.query;
        const tenantId = String(source?.tenantId || '').trim();
        const mode = String(source?.mode || '').trim().toLowerCase();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId)
            || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_META_ADS_MANAGE)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            if (mode === 'historical_current_year') {
                const result = await metaAdsSyncService.syncMetaAdsHistoricalCurrentYear(tenantId, {
                    force: source?.force === true || String(source?.force || '').trim().toLowerCase() === 'true'
                });
                return res.json({
                    ok: true,
                    tenantId,
                    mode: 'historical_current_year',
                    result
                });
            }

            const now = new Date();
            const today = now.toISOString().slice(0, 10);
            const dateStart = String(source?.dateStart || '').trim() || today;
            const dateStop = String(source?.dateStop || '').trim() || dateStart;
            const structure = await metaAdsSyncService.syncMetaAdsStructure(tenantId);
            const insights = await metaAdsSyncService.syncMetaAdsInsights(tenantId, dateStart, dateStop);
            return res.json({
                ok: true,
                tenantId,
                mode: 'incremental',
                dateStart,
                dateStop,
                adsCount: Number(structure?.totalCount || 0),
                insightsCount: Number(insights?.insightsCount || 0),
                structure,
                insights
            });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo sincronizar Meta Ads.') });
        }
    });
}

module.exports = {
    registerTenantMetaAdsHttpRoutes
};
