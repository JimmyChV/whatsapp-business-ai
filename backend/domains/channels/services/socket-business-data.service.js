function createSocketBusinessDataService({
    waClient,
    waModuleService,
    tenantCatalogService,
    tenantLabelService,
    tenantSettingsService,
    tenantIntegrationsService,
    tenantService,
    planLimitsService,
    loadCatalog,
    getWooCatalog,
    isWooConfigured,
    resolveProfilePic,
    normalizeBusinessDetailsSnapshot,
    extractContactSnapshot,
    snapshotSerializable,
    extractCatalogItemCategories,
    logCatalogDebugSnapshot
} = {}) {
    const registerBusinessDataHandlers = ({
        socket,
        tenantId = 'default',
        authContext,
        transportOrchestrator,
        normalizeSocketModuleId
    } = {}) => {
        const normalizeSocketCatalogId = (value = '') => String(value || '').trim().toUpperCase();
        const normalizeSocketCatalogIdList = (value = []) => {
            const source = Array.isArray(value) ? value : [];
            const seen = new Set();
            const out = [];
            source.forEach((entry) => {
                const clean = normalizeSocketCatalogId(entry);
                if (!/^CAT-[A-Z0-9]{4,}$/.test(clean)) return;
                if (seen.has(clean)) return;
                seen.add(clean);
                out.push(clean);
            });
            return out;
        };

        const getCatalogIdsFromModuleContext = (moduleContext = null) => {
            const moduleSettings = moduleContext?.metadata?.moduleSettings && typeof moduleContext.metadata.moduleSettings === 'object'
                ? moduleContext.metadata.moduleSettings
                : {};
            return normalizeSocketCatalogIdList(moduleSettings.catalogIds);
        };

        const getActiveCatalogScope = () => {
            const selectedModuleContext = socket?.data?.waModule || null;
            return {
                tenantId,
                moduleId: String(selectedModuleContext?.moduleId || '').trim() || null,
                channelType: String(selectedModuleContext?.channelType || '').trim().toLowerCase() || null,
                catalogIds: getCatalogIdsFromModuleContext(selectedModuleContext)
            };
        };

        const resolveCatalogSelection = async (scope = {}) => {
            const catalogs = await tenantCatalogService.ensureDefaultCatalog(tenantId).catch(() => []);
            const activeCatalogs = (Array.isArray(catalogs) ? catalogs : []).filter((entry) => entry?.isActive !== false);
            const activeCatalogIds = new Set(activeCatalogs.map((entry) => normalizeSocketCatalogId(entry?.catalogId)).filter(Boolean));

            let catalogIds = normalizeSocketCatalogIdList(scope.catalogIds);
            catalogIds = catalogIds.filter((catalogId) => activeCatalogIds.has(catalogId));

            const defaultCatalogId = normalizeSocketCatalogId(
                activeCatalogs.find((entry) => entry?.isDefault)?.catalogId
                || activeCatalogs[0]?.catalogId
                || ''
            ) || null;

            if (!catalogIds.length) {
                catalogIds = activeCatalogs
                    .map((entry) => normalizeSocketCatalogId(entry?.catalogId))
                    .filter(Boolean);
            }
            if (!catalogIds.length && defaultCatalogId) {
                catalogIds = [defaultCatalogId];
            }
            const primaryCatalogId = defaultCatalogId && catalogIds.includes(defaultCatalogId)
                ? defaultCatalogId
                : (catalogIds[0] || defaultCatalogId || null);

            return {
                catalogIds,
                defaultCatalogId,
                primaryCatalogId,
                catalogs: activeCatalogs.filter((entry) => catalogIds.includes(normalizeSocketCatalogId(entry?.catalogId)))
            };
        };

        const loadScopedLocalCatalog = async (scope = {}, { requestedCatalogId = '' } = {}) => {
            const selection = await resolveCatalogSelection(scope);
            let catalogIds = [...selection.catalogIds];
            const requested = normalizeSocketCatalogId(requestedCatalogId);
            if (requested && catalogIds.includes(requested)) {
                catalogIds = [requested];
            }

            const catalogNameMap = new Map();
            (Array.isArray(selection.catalogs) ? selection.catalogs : []).forEach((entry) => {
                const cleanCatalogId = normalizeSocketCatalogId(entry?.catalogId);
                if (!cleanCatalogId) return;
                catalogNameMap.set(cleanCatalogId, String(entry?.name || cleanCatalogId).trim() || cleanCatalogId);
            });

            const merged = [];
            for (const catalogId of catalogIds) {
                const includeLegacyEmptyCatalogId = Boolean(
                    catalogId
                    && selection.defaultCatalogId
                    && catalogId === selection.defaultCatalogId
                );
                const scopedItems = await loadCatalog({
                    tenantId: scope?.tenantId || tenantId,
                    moduleId: scope?.moduleId || null,
                    channelType: scope?.channelType || null,
                    catalogId,
                    includeLegacyEmptyCatalogId
                });
                (Array.isArray(scopedItems) ? scopedItems : []).forEach((item) => {
                    merged.push({
                        ...item,
                        catalogId: normalizeSocketCatalogId(item?.catalogId || catalogId || '') || null,
                        catalogName: catalogNameMap.get(catalogId) || catalogId || null
                    });
                });
            }

            return {
                items: merged,
                selection: {
                    ...selection,
                    catalogIds,
                    catalogs: (Array.isArray(selection.catalogs) ? selection.catalogs : [])
                        .filter((entry) => catalogIds.includes(normalizeSocketCatalogId(entry?.catalogId))),
                    primaryCatalogId: catalogIds[0] || selection.primaryCatalogId || null
                }
            };
        };

        const resolveCatalogScope = async ({ requestedModuleId = '', requestedCatalogId = '' } = {}) => {
            const normalizedRequested = normalizeSocketModuleId(requestedModuleId);
            if (!normalizedRequested) {
                const activeScope = getActiveCatalogScope();
                const activeSelection = await resolveCatalogSelection(activeScope);
                const overrideCatalogId = normalizeSocketCatalogId(requestedCatalogId);
                const nextCatalogIds = overrideCatalogId && activeSelection.catalogIds.includes(overrideCatalogId)
                    ? [overrideCatalogId]
                    : activeSelection.catalogIds;
                return {
                    ...activeScope,
                    catalogIds: nextCatalogIds,
                    catalogId: nextCatalogIds[0] || activeSelection.primaryCatalogId || null
                };
            }

            const activeModuleId = normalizeSocketModuleId(
                socket?.data?.waModule?.moduleId
                || socket?.data?.waModuleId
                || ''
            );
            if (activeModuleId && activeModuleId === normalizedRequested) {
                const activeScope = getActiveCatalogScope();
                const activeSelection = await resolveCatalogSelection(activeScope);
                const overrideCatalogId = normalizeSocketCatalogId(requestedCatalogId);
                const nextCatalogIds = overrideCatalogId && activeSelection.catalogIds.includes(overrideCatalogId)
                    ? [overrideCatalogId]
                    : activeSelection.catalogIds;
                return {
                    ...activeScope,
                    catalogIds: nextCatalogIds,
                    catalogId: nextCatalogIds[0] || activeSelection.primaryCatalogId || null
                };
            }

            const userId = String(authContext?.userId || authContext?.id || '').trim();
            const allowedModules = await waModuleService.listModules(tenantId, {
                includeInactive: false,
                userId
            });
            const selected = (Array.isArray(allowedModules) ? allowedModules : [])
                .find((entry) => normalizeSocketModuleId(entry?.moduleId) === normalizedRequested);
            if (!selected) {
                throw new Error('No tienes acceso al modulo solicitado para catalogo.');
            }

            const baseScope = {
                tenantId,
                moduleId: String(selected?.moduleId || '').trim() || null,
                channelType: String(selected?.channelType || '').trim().toLowerCase() || null,
                catalogIds: getCatalogIdsFromModuleContext(selected)
            };
            const selection = await resolveCatalogSelection(baseScope);
            const overrideCatalogId = normalizeSocketCatalogId(requestedCatalogId);
            const nextCatalogIds = overrideCatalogId && selection.catalogIds.includes(overrideCatalogId)
                ? [overrideCatalogId]
                : selection.catalogIds;

            return {
                ...baseScope,
                catalogIds: nextCatalogIds,
                catalogId: nextCatalogIds[0] || selection.primaryCatalogId || null
            };
        };

        socket.on('get_business_catalog', async ({ moduleId, catalogId, requestSeq } = {}) => {
            try {
                const catalogScope = await resolveCatalogScope({
                    requestedModuleId: moduleId,
                    requestedCatalogId: catalogId
                });
                const scopedCatalog = await loadScopedLocalCatalog(catalogScope, {
                    requestedCatalogId: catalogId
                });
                socket.emit('business_data_catalog', {
                    scope: {
                        ...catalogScope,
                        catalogIds: scopedCatalog.selection.catalogIds,
                        catalogId: scopedCatalog.selection.primaryCatalogId,
                        catalogs: scopedCatalog.selection.catalogs || []
                    },
                    source: 'local',
                    requestSeq: Number(requestSeq || 0) || null,
                    items: scopedCatalog.items
                });
            } catch (error) {
                socket.emit('error', String(error?.message || 'No se pudo cargar el catalogo del modulo.'));
            }
        });

        socket.on('get_business_data', async (scopeRequest = {}) => {
            const requestSeq = scopeRequest && typeof scopeRequest === 'object'
                ? (Number(scopeRequest?.requestSeq || 0) || null)
                : null;
            try {
                const requestedModuleId = scopeRequest && typeof scopeRequest === 'object' ? scopeRequest?.moduleId : '';
                const requestedCatalogId = scopeRequest && typeof scopeRequest === 'object' ? scopeRequest?.catalogId : '';
                const catalogScope = await resolveCatalogScope({
                    requestedModuleId,
                    requestedCatalogId
                });
                const requestedModuleScopeId = normalizeSocketModuleId(catalogScope?.moduleId || requestedModuleId);
                const availableSocketModules = Array.isArray(socket?.data?.waModules) ? socket.data.waModules : [];
                const selectedModuleContext = requestedModuleScopeId
                    ? (availableSocketModules.find((entry) => normalizeSocketModuleId(entry?.moduleId) === requestedModuleScopeId) || socket?.data?.waModule || null)
                    : (socket?.data?.waModule || null);
                const resolvedCatalogSelection = await resolveCatalogSelection(catalogScope);

                if (!transportOrchestrator.ensureTransportReady(socket, { action: 'cargar datos del negocio', errorEvent: 'error' })) {
                    const scopedLocalFallback = await loadScopedLocalCatalog(catalogScope);
                    socket.emit('business_data', {
                        profile: null,
                        labels: [],
                        catalog: scopedLocalFallback.items,
                        requestSeq,
                        catalogMeta: {
                            source: 'local',
                            nativeAvailable: false,
                            wooConfigured: false,
                            wooAvailable: false,
                            scope: {
                                ...catalogScope,
                                catalogIds: scopedLocalFallback.selection.catalogIds,
                                catalogId: scopedLocalFallback.selection.primaryCatalogId
                            }
                        }
                    });
                    return;
                }
                const me = waClient.client.info;
                const meId = me.wid._serialized;

                // Real profile from WA account info
                let meContact = null;
                let profilePicUrl = null;
                let businessProfile = null;
                let aboutStatus = null;
                try {
                    if (meId) meContact = await waClient.client.getContactById(meId);
                } catch (e) { }
                try {
                    profilePicUrl = await resolveProfilePic(waClient.client, meId, [
                        me?.wid?.user,
                        meContact?.id?._serialized,
                        meContact?.number
                    ]);
                } catch (e) { }
                try { businessProfile = await waClient.getBusinessProfile(meId); } catch (e) { }
                try {
                    if (meContact?.getAbout) aboutStatus = await meContact.getAbout();
                } catch (e) { }

                const businessDetails = normalizeBusinessDetailsSnapshot(businessProfile);
                const contactSnapshot = extractContactSnapshot(meContact);
                const profile = {
                    name: me?.pushname || meContact?.name || meContact?.pushname || 'Mi Negocio',
                    pushname: me?.pushname || meContact?.pushname || null,
                    shortName: meContact?.shortName || null,
                    verifiedName: meContact?._data?.verifiedName || null,
                    verifiedLevel: meContact?._data?.verifiedLevel || null,
                    phone: me?.wid?.user || meContact?.number || null,
                    id: meId || null,
                    platform: me?.platform || null,
                    isBusiness: Boolean(meContact?.isBusiness ?? true),
                    isEnterprise: Boolean(meContact?.isEnterprise),
                    isMyContact: Boolean(meContact?.isMyContact),
                    isMe: Boolean(meContact?.isMe ?? true),
                    isWAContact: Boolean(meContact?.isWAContact ?? true),
                    status: aboutStatus || null,
                    profilePicUrl,
                    businessHours: businessDetails?.businessHours || null,
                    category: businessDetails?.category || null,
                    email: businessDetails?.email || null,
                    website: businessDetails?.website || null,
                    websites: businessDetails?.websites || [],
                    address: businessDetails?.address || null,
                    description: businessDetails?.description || null,
                    businessDetails,
                    whatsappInfo: snapshotSerializable(me),
                    contactSnapshot
                };

                // Labels desde store tenant (Postgres/file), no desde WhatsApp Web.
                let labels = [];
                try {
                    labels = await tenantLabelService.listLabels({ tenantId, includeInactive: false });
                    profile.labelsCount = Array.isArray(labels) ? labels.length : 0;
                } catch (e) {
                    labels = [];
                }

                const tenantSettings = await tenantSettingsService.getTenantSettings(tenantId);
                const tenantIntegrations = await tenantIntegrationsService.getTenantIntegrations(tenantId, { runtime: true });
                const activeCatalogId = normalizeSocketCatalogId(catalogScope?.catalogId || resolvedCatalogSelection?.primaryCatalogId || '');
                const activeCatalogConfig = (Array.isArray(resolvedCatalogSelection?.catalogs) ? resolvedCatalogSelection.catalogs : [])
                    .find((entry) => normalizeSocketCatalogId(entry?.catalogId) === activeCatalogId) || null;
                const activeCatalogRuntime = activeCatalogId
                    ? await tenantCatalogService.getCatalog(tenantId, activeCatalogId, { runtime: true }).catch(() => null)
                    : null;
                const activeCatalogSourceType = String(activeCatalogConfig?.sourceType || '').trim().toLowerCase();

                const moduleCatalogMode = String(selectedModuleContext?.metadata?.moduleSettings?.catalogMode || '').trim().toLowerCase();
                const configuredCatalogMode = String(tenantIntegrations?.catalog?.mode || tenantSettings?.catalogMode || 'hybrid').trim().toLowerCase();
                const forcedCatalogMode = activeCatalogSourceType === 'local'
                    ? 'local_only'
                    : (activeCatalogSourceType === 'woocommerce'
                        ? 'woo_only'
                        : (activeCatalogSourceType === 'meta' ? 'meta_only' : ''));
                const catalogMode = forcedCatalogMode
                    || (moduleCatalogMode && moduleCatalogMode !== 'inherit'
                        ? moduleCatalogMode
                        : configuredCatalogMode);

                const integrationsWooConfig = tenantIntegrations?.catalog?.providers?.woocommerce || {};
                const activeCatalogWooConfig = (activeCatalogRuntime?.config?.woocommerce && typeof activeCatalogRuntime.config.woocommerce === 'object')
                    ? activeCatalogRuntime.config.woocommerce
                    : ((activeCatalogConfig?.config?.woocommerce && typeof activeCatalogConfig.config.woocommerce === 'object')
                        ? activeCatalogConfig.config.woocommerce
                        : {});
                const wooConfig = {
                    ...integrationsWooConfig,
                    ...activeCatalogWooConfig,
                    baseUrl: String(activeCatalogWooConfig?.baseUrl || '').trim() || String(integrationsWooConfig?.baseUrl || '').trim() || '',
                    consumerKey: String(activeCatalogWooConfig?.consumerKey || '').trim() || String(integrationsWooConfig?.consumerKey || '').trim() || '',
                    consumerSecret: String(activeCatalogWooConfig?.consumerSecret || '').trim() || String(integrationsWooConfig?.consumerSecret || '').trim() || '',
                    perPage: Number(activeCatalogWooConfig?.perPage || integrationsWooConfig?.perPage || 100) || 100,
                    maxPages: Number(activeCatalogWooConfig?.maxPages || integrationsWooConfig?.maxPages || 10) || 10,
                    includeOutOfStock: Object.prototype.hasOwnProperty.call(activeCatalogWooConfig, 'includeOutOfStock')
                        ? activeCatalogWooConfig.includeOutOfStock !== false
                        : integrationsWooConfig?.includeOutOfStock !== false,
                    enabled: activeCatalogSourceType === 'woocommerce'
                        ? activeCatalogWooConfig?.enabled !== false
                        : integrationsWooConfig?.enabled !== false
                };
                const wooConfigured = isWooConfigured(wooConfig);
                const tenantPlan = tenantService.findTenantById(tenantId) || tenantService.DEFAULT_TENANT;
                const catalogEnabled = planLimitsService.isFeatureEnabledForTenant('catalog', tenantPlan, tenantSettings);
                if (!catalogEnabled) {
                    socket.emit('business_data', {
                        profile,
                        labels,
                        catalog: [],
                        catalogMeta: {
                            source: 'disabled',
                            mode: catalogMode,
                            selectedCatalogSource: activeCatalogSourceType || null,
                            nativeAvailable: false,
                            wooConfigured,
                            wooAvailable: false,
                            disabledReason: 'catalog_module_disabled',
                            categories: []
                        },
                        tenantSettings,
                        integrations: tenantIntegrations
                    });
                    return;
                }

                let catalog = [];
                let catalogMeta = {
                    source: 'native',
                    mode: catalogMode,
                    selectedCatalogSource: activeCatalogSourceType || null,
                    nativeAvailable: false,
                    wooConfigured,
                    wooAvailable: false,
                    wooSource: null,
                    wooStatus: null,
                    wooReason: null
                };

                const enableNative = catalogMode === 'hybrid' || catalogMode === 'meta_only';
                const enableWoo = catalogMode === 'hybrid' || catalogMode === 'woo_only';
                const enableLocal = catalogMode === 'hybrid' || catalogMode === 'local_only';
                let scopedLocalCatalogResult = null;
                // En modo hibrido priorizamos catalogo local del modulo si existe.
                // Esto evita que Woo/Meta pisen catalogos separados por modulo.
                if (enableLocal) {
                    scopedLocalCatalogResult = await loadScopedLocalCatalog(catalogScope);
                    const localCatalog = scopedLocalCatalogResult.items;
                    if (Array.isArray(localCatalog) && localCatalog.length > 0) {
                        catalog = localCatalog;
                        catalogMeta = {
                            ...catalogMeta,
                            source: 'local',
                            nativeAvailable: false,
                            wooConfigured,
                            wooAvailable: false,
                            scope: {
                                ...catalogScope,
                                catalogIds: scopedLocalCatalogResult.selection.catalogIds,
                                catalogId: scopedLocalCatalogResult.selection.primaryCatalogId,
                                catalogs: scopedLocalCatalogResult.selection.catalogs || []
                            }
                        };
                    }
                }
                if (!catalog.length && enableNative) {
                    try {
                        const nativeProducts = await waClient.getCatalog(meId);
                        if (nativeProducts && nativeProducts.length > 0) {
                            catalog = nativeProducts.map((p) => ({
                                id: p.id,
                                title: p.name,
                                price: p.price ? Number.parseFloat(String(p.price)).toFixed(2) : '0.00',
                                description: p.description,
                                imageUrl: p.imageUrls ? p.imageUrls[0] : null,
                                source: 'meta'
                            }));
                            catalogMeta = {
                                ...catalogMeta,
                                source: 'meta',
                                nativeAvailable: true,
                                wooAvailable: false
                            };
                        }
                    } catch (_) {
                        // noop
                    }
                }

                if (!catalog.length && enableWoo) {
                    const wooResult = await getWooCatalog({ config: wooConfig });
                    if (wooResult.products.length > 0) {
                        catalog = wooResult.products;
                        catalogMeta = {
                            ...catalogMeta,
                            source: 'woocommerce',
                            nativeAvailable: false,
                            wooAvailable: true,
                            wooSource: wooResult.source,
                            wooStatus: wooResult.status,
                            wooReason: wooResult.reason
                        };
                    } else {
                        catalogMeta = {
                            ...catalogMeta,
                            wooConfigured,
                            wooAvailable: false,
                            wooSource: wooResult.source,
                            wooStatus: wooResult.status,
                            wooReason: wooResult.reason
                        };
                    }
                }

                if (!catalog.length && enableLocal) {
                    if (!scopedLocalCatalogResult) {
                        scopedLocalCatalogResult = await loadScopedLocalCatalog(catalogScope);
                    }
                    catalog = scopedLocalCatalogResult.items;
                    catalogMeta = {
                        ...catalogMeta,
                        source: 'local',
                        nativeAvailable: false,
                        wooConfigured,
                        wooAvailable: false,
                        scope: {
                            ...catalogScope,
                            catalogIds: scopedLocalCatalogResult.selection.catalogIds,
                            catalogId: scopedLocalCatalogResult.selection.primaryCatalogId,
                            catalogs: scopedLocalCatalogResult.selection.catalogs || []
                        }
                    };
                }

                const catalogCategories = Array.from(new Set(
                    (catalog || [])
                        .flatMap((item) => extractCatalogItemCategories(item))
                        .map((entry) => String(entry || '').trim())
                        .filter(Boolean)
                )).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
                const resolvedScope = scopedLocalCatalogResult?.selection
                    ? {
                        ...catalogScope,
                        catalogIds: scopedLocalCatalogResult.selection.catalogIds,
                        catalogId: scopedLocalCatalogResult.selection.primaryCatalogId,
                        catalogs: scopedLocalCatalogResult.selection.catalogs || []
                    }
                    : {
                        ...catalogScope,
                        catalogIds: resolvedCatalogSelection.catalogIds,
                        catalogId: resolvedCatalogSelection.primaryCatalogId,
                        catalogs: resolvedCatalogSelection.catalogs || []
                    };
                catalogMeta = {
                    ...catalogMeta,
                    categories: catalogCategories,
                    scope: resolvedScope
                };
                logCatalogDebugSnapshot({ catalog, catalogMeta });
                socket.emit('business_data', { profile, labels, catalog, catalogMeta, tenantSettings, integrations: tenantIntegrations, requestSeq });
            } catch (e) {
                console.error('Error fetching business data:', e);
                const fallbackCatalogScope = getActiveCatalogScope();
                const fallbackCatalog = await loadScopedLocalCatalog(fallbackCatalogScope);
                socket.emit('business_data', {
                    profile: null,
                    labels: [],
                    catalog: fallbackCatalog.items,
                    requestSeq,
                    catalogMeta: {
                        source: 'local',
                        mode: 'hybrid',
                        nativeAvailable: false,
                        wooConfigured: false,
                        wooAvailable: false,
                        wooSource: null,
                        wooStatus: 'error',
                        wooReason: 'Error al obtener datos de negocio',
                        scope: {
                            ...fallbackCatalogScope,
                            catalogIds: fallbackCatalog.selection.catalogIds,
                            catalogId: fallbackCatalog.selection.primaryCatalogId,
                            catalogs: fallbackCatalog.selection.catalogs || []
                        }
                    },
                    tenantSettings: await tenantSettingsService.getTenantSettings(tenantId),
                    integrations: await tenantIntegrationsService.getTenantIntegrations(tenantId)
                });
            }
        });
    };

    return {
        registerBusinessDataHandlers
    };
}

module.exports = {
    createSocketBusinessDataService
};
