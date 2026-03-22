const tenantDomainServices = require('./services');

module.exports = {
    tenantService: tenantDomainServices.tenantService,
    tenantSettingsService: tenantDomainServices.tenantSettingsService,
    saasControlService: tenantDomainServices.saasControlService,
    tenantIntegrationsService: tenantDomainServices.tenantIntegrationsService,
    tenantCatalogService: tenantDomainServices.tenantCatalogService,
    catalogManagerService: tenantDomainServices.catalogManagerService,
    tenantLabelService: tenantDomainServices.tenantLabelService,
    waModuleService: tenantDomainServices.waModuleService,
    customerService: tenantDomainServices.customerService,
    quickReplyLibrariesService: tenantDomainServices.quickReplyLibrariesService,
    quickRepliesManagerService: tenantDomainServices.quickRepliesManagerService,
    aiUsageService: tenantDomainServices.aiUsageService,
    registerTenantCustomerHttpRoutes: require('./routes/http-routes-customers').registerTenantCustomerHttpRoutes,
    registerTenantWaModuleAdminHttpRoutes: require('./routes/http-routes-wa-modules').registerTenantWaModuleAdminHttpRoutes,
    registerTenantRuntimeSettingsHttpRoutes: require('./routes/http-routes-runtime-settings').registerTenantRuntimeSettingsHttpRoutes,
    registerTenantLabelsQuickRepliesHttpRoutes: require('./routes/http-routes-labels-quick-replies').registerTenantLabelsQuickRepliesHttpRoutes,
    registerTenantAdminConfigCatalogHttpRoutes: require('./routes/http-routes-admin-config-catalog').registerTenantAdminConfigCatalogHttpRoutes,
    registerTenantAdminTenantsUsersHttpRoutes: require('./routes/http-routes-admin-tenants-users').registerTenantAdminTenantsUsersHttpRoutes,
    registerTenantAssetsUploadHttpRoutes: require('./routes/http-routes-assets-upload').registerTenantAssetsUploadHttpRoutes,
    registerTenantRuntimePublicHttpRoutes: require('./routes/http-routes-runtime-public').registerTenantRuntimePublicHttpRoutes
};











