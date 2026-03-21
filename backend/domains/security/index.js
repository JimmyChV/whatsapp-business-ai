const securityServices = require('./services');

module.exports = {
    ...securityServices,
    accessPolicyService: require('./access-policy.service'),
    registerSecurityAuthHttpRoutes: require('./http-routes-auth').registerSecurityAuthHttpRoutes,
    registerSecurityAccessControlHttpRoutes: require('./http-routes-access-control').registerSecurityAccessControlHttpRoutes
};
