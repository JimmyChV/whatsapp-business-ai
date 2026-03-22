const tenantDomainServices = require('./services');

module.exports = {
    tenantService: tenantDomainServices.tenantService,
    tenantSettingsService: tenantDomainServices.tenantSettingsService,
    saasControlService: tenantDomainServices.saasControlService,
    tenantIntegrationsService: require('./integrations.service'),
    tenantCatalogService: tenantDomainServices.tenantCatalogService,
    catalogManagerService: tenantDomainServices.catalogManagerService,
    tenantLabelService: tenantDomainServices.tenantLabelService,
    waModuleService: tenantDomainServices.waModuleService,
    customerService: tenantDomainServices.customerService,
    quickReplyLibrariesService: require('./quick-reply-libraries.service'),
    quickRepliesManagerService: tenantDomainServices.quickRepliesManagerService,
    aiUsageService: tenantDomainServices.aiUsageService,
    registerTenantCustomerHttpRoutes: require('./http-routes-customers').registerTenantCustomerHttpRoutes,
    registerTenantWaModuleAdminHttpRoutes: require('./http-routes-wa-modules').registerTenantWaModuleAdminHttpRoutes,
    registerTenantRuntimeSettingsHttpRoutes: require('./http-routes-runtime-settings').registerTenantRuntimeSettingsHttpRoutes,
    registerTenantLabelsQuickRepliesHttpRoutes: require('./http-routes-labels-quick-replies').registerTenantLabelsQuickRepliesHttpRoutes,
    registerTenantAdminConfigCatalogHttpRoutes: require('./http-routes-admin-config-catalog').registerTenantAdminConfigCatalogHttpRoutes,
    registerTenantAdminTenantsUsersHttpRoutes: require('./http-routes-admin-tenants-users').registerTenantAdminTenantsUsersHttpRoutes,
    registerTenantAssetsUploadHttpRoutes: require('./http-routes-assets-upload').registerTenantAssetsUploadHttpRoutes,
    registerTenantRuntimePublicHttpRoutes: require('./http-routes-runtime-public').registerTenantRuntimePublicHttpRoutes
};










