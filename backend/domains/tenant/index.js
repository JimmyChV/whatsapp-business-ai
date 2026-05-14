const tenantDomainServices = require('./services');
const tenantRoutes = require('./routes');

module.exports = {
    tenantService: tenantDomainServices.tenantService,
    tenantSettingsService: tenantDomainServices.tenantSettingsService,
    saasControlService: tenantDomainServices.saasControlService,
    tenantIntegrationsService: tenantDomainServices.tenantIntegrationsService,
    tenantCatalogService: tenantDomainServices.tenantCatalogService,
    catalogManagerService: tenantDomainServices.catalogManagerService,
    tenantLabelService: tenantDomainServices.tenantLabelService,
    tenantZoneRulesService: tenantDomainServices.tenantZoneRulesService,
    saasUserUiPreferencesService: tenantDomainServices.saasUserUiPreferencesService,
    waModuleService: tenantDomainServices.waModuleService,
    customerService: tenantDomainServices.customerService,
    customerAddressesService: tenantDomainServices.customerAddressesService,
    customerCatalogsService: tenantDomainServices.customerCatalogsService,
    quickReplyLibrariesService: tenantDomainServices.quickReplyLibrariesService,
    quickRepliesManagerService: tenantDomainServices.quickRepliesManagerService,
    tenantAutomationService: tenantDomainServices.tenantAutomationService,
    aiUsageService: tenantDomainServices.aiUsageService,
    ...tenantRoutes
};

