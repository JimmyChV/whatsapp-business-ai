module.exports = {
    tenantService: require('../../tenant_service'),
    tenantSettingsService: require('../../tenant_settings_service'),
    saasControlService: require('../../saas_control_plane_service'),
    tenantIntegrationsService: require('./integrations.service'),
    tenantCatalogService: require('../../tenant_catalog_service'),
    tenantLabelService: require('../../tenant_label_service'),
    waModuleService: require('../../wa_module_service'),
    customerService: require('../../customer_service'),
    quickReplyLibrariesService: require('./quick-reply-libraries.service'),
    aiUsageService: require('../../ai_usage_service'),
    registerTenantCustomerHttpRoutes: require('./http-routes-customers').registerTenantCustomerHttpRoutes,
    registerTenantWaModuleAdminHttpRoutes: require('./http-routes-wa-modules').registerTenantWaModuleAdminHttpRoutes,
    registerTenantRuntimeSettingsHttpRoutes: require('./http-routes-runtime-settings').registerTenantRuntimeSettingsHttpRoutes,
    registerTenantLabelsQuickRepliesHttpRoutes: require('./http-routes-labels-quick-replies').registerTenantLabelsQuickRepliesHttpRoutes
};




