const metaAdsSyncService = require('../services/meta-ads-sync.service');

const META_ADS_TIME_ZONE = 'America/Lima';

function getDateLabelInTimeZone(date = new Date(), timeZone = META_ADS_TIME_ZONE) {
    const safeDate = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(safeDate.getTime())) return '';
    return safeDate.toLocaleDateString('en-CA', { timeZone });
}

function isOwnerForTenant(req = {}, tenantId = '') {
    const user = req?.authContext?.user && typeof req.authContext.user === 'object'
        ? req.authContext.user
        : null;
    if (!user) return false;
    if (user.isSuperAdmin === true) return true;
    const cleanTenantId = String(tenantId || '').trim();
    const directRole = String(user.role || '').trim().toLowerCase();
    const directTenantId = String(user.tenantId || '').trim();
    if (directRole === 'owner' && (!cleanTenantId || !directTenantId || directTenantId === cleanTenantId)) {
        return true;
    }
    return (Array.isArray(user.memberships) ? user.memberships : []).some((membership) => {
        const membershipTenantId = String(membership?.tenantId || membership?.tenant_id || '').trim();
        const membershipRole = String(membership?.role || '').trim().toLowerCase();
        const membershipActive = membership?.active !== false;
        return membershipActive
            && membershipRole === 'owner'
            && (!cleanTenantId || membershipTenantId === cleanTenantId);
    });
}

function canEditMetaAdsCreative(req = {}, tenantId = '') {
    const user = req?.authContext?.user && typeof req.authContext.user === 'object'
        ? req.authContext.user
        : null;
    if (!user) return false;
    if (user.isSuperAdmin === true) return true;
    const cleanTenantId = String(tenantId || '').trim();
    const directRole = String(user.role || '').trim().toLowerCase();
    const directTenantId = String(user.tenantId || '').trim();
    if (['owner', 'admin'].includes(directRole) && (!cleanTenantId || !directTenantId || directTenantId === cleanTenantId)) {
        return true;
    }
    return (Array.isArray(user.memberships) ? user.memberships : []).some((membership) => {
        const membershipTenantId = String(membership?.tenantId || membership?.tenant_id || '').trim();
        const membershipRole = String(membership?.role || '').trim().toLowerCase();
        const membershipActive = membership?.active !== false;
        return membershipActive
            && ['owner', 'admin'].includes(membershipRole)
            && (!cleanTenantId || membershipTenantId === cleanTenantId);
    });
}

function getActorUserId(req = {}) {
    const user = req?.authContext?.user && typeof req.authContext.user === 'object'
        ? req.authContext.user
        : {};
    return String(user.userId || user.user_id || user.id || '').trim();
}

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

            if (mode === 'creatives') {
                if (!isOwnerForTenant(req, tenantId)) {
                    return res.status(403).json({ ok: false, error: 'Solo un owner puede sincronizar creativos Meta manualmente.' });
                }
                const creatives = await metaAdsSyncService.syncAdCreatives(tenantId);
                return res.json({
                    ok: true,
                    tenantId,
                    mode: 'creatives',
                    creativesCount: Number(creatives?.creativesCount || 0),
                    creatives
                });
            }

            const today = getDateLabelInTimeZone();
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

    app.get('/api/tenant/meta-ads/ad-stats/:adId', async (req, res) => {
        const tenantId = String(req.query?.tenantId || req.body?.tenantId || '').trim();
        const adId = String(req.params?.adId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!adId) return res.status(400).json({ ok: false, error: 'adId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId)
            || !hasAnyPermission(req, [
                accessPolicyService.PERMISSIONS.TENANT_META_ADS_READ,
                accessPolicyService.PERMISSIONS.TENANT_META_ADS_MANAGE
            ])) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const stats = await metaAdsSyncService.getMetaAdConversationStats(tenantId, adId, {
                dateStart: req.query?.dateStart,
                dateStop: req.query?.dateStop
            });
            return res.json({ ok: true, tenantId, adId, ...stats });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudieron cargar estadisticas del anuncio.') });
        }
    });

    app.patch('/api/tenant/meta-ads/creatives/:adId', async (req, res) => {
        const source = req.body && typeof req.body === 'object' ? req.body : {};
        const tenantId = String(source?.tenantId || req.query?.tenantId || '').trim();
        const adId = String(req.params?.adId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!adId) return res.status(400).json({ ok: false, error: 'adId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId)
            || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_META_ADS_MANAGE)
            || !canEditMetaAdsCreative(req, tenantId)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            if (source?.useAutoGreeting === true) {
                const reverted = await metaAdsSyncService.revertMetaAdCreativeGreetingToAuto(tenantId, adId);
                return res.json({ ok: true, ...reverted });
            }
            await metaAdsSyncService.updateMetaAdCreativeGreeting(tenantId, adId, source?.greetingText);
            return res.json({ ok: true });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo guardar el greeting Meta.') });
        }
    });

    app.patch('/api/meta-ads/ads/:adId/channel', async (req, res) => {
        const source = req.body && typeof req.body === 'object' ? req.body : {};
        const tenantId = String(source?.tenantId || req.query?.tenantId || '').trim();
        const adId = String(req.params?.adId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!adId) return res.status(400).json({ ok: false, error: 'adId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId)
            || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_META_ADS_MANAGE)
            || !isOwnerForTenant(req, tenantId)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const result = await metaAdsSyncService.updateMetaAdChannel(tenantId, adId, {
                isExternal: source?.isExternal,
                externalChannel: source?.externalChannel
            });
            return res.json({ ok: true, ...result });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar el canal del anuncio.') });
        }
    });

    app.get('/api/meta-ads/ads/:adId/external-sales', async (req, res) => {
        const tenantId = String(req.query?.tenantId || '').trim();
        const adId = String(req.params?.adId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!adId) return res.status(400).json({ ok: false, error: 'adId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId)
            || !hasAnyPermission(req, [
                accessPolicyService.PERMISSIONS.TENANT_META_ADS_READ,
                accessPolicyService.PERMISSIONS.TENANT_META_ADS_MANAGE
            ])) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const items = await metaAdsSyncService.listMetaAdExternalSales(tenantId, adId);
            return res.json({ ok: true, tenantId, adId, items });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudieron cargar ventas externas del anuncio.') });
        }
    });

    app.post('/api/meta-ads/ads/:adId/external-sales', async (req, res) => {
        const source = req.body && typeof req.body === 'object' ? req.body : {};
        const tenantId = String(source?.tenantId || req.query?.tenantId || '').trim();
        const adId = String(req.params?.adId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!adId) return res.status(400).json({ ok: false, error: 'adId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId)
            || !hasAnyPermission(req, [
                accessPolicyService.PERMISSIONS.TENANT_META_ADS_READ,
                accessPolicyService.PERMISSIONS.TENANT_META_ADS_MANAGE
            ])) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const item = await metaAdsSyncService.createMetaAdExternalSale(tenantId, adId, source, getActorUserId(req));
            return res.status(201).json({ ok: true, tenantId, adId, item });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo registrar venta externa del anuncio.') });
        }
    });

    app.delete('/api/meta-ads/ads/:adId/external-sales/:saleId', async (req, res) => {
        const tenantId = String(req.query?.tenantId || req.body?.tenantId || '').trim();
        const adId = String(req.params?.adId || '').trim();
        const saleId = String(req.params?.saleId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!adId) return res.status(400).json({ ok: false, error: 'adId invalido.' });
        if (!saleId) return res.status(400).json({ ok: false, error: 'saleId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId)
            || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_META_ADS_MANAGE)
            || !canEditMetaAdsCreative(req, tenantId)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const result = await metaAdsSyncService.deleteMetaAdExternalSale(tenantId, adId, saleId);
            return res.json({ ok: true, ...result });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo eliminar la venta externa.') });
        }
    });
}

module.exports = {
    registerTenantMetaAdsHttpRoutes
};
