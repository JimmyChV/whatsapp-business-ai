const securityServices = require('./services');

module.exports = {
    ...securityServices,
    registerSecurityAuthHttpRoutes: require('./routes/http-routes-auth').registerSecurityAuthHttpRoutes,
    registerSecurityAccessControlHttpRoutes: require('./routes/http-routes-access-control').registerSecurityAccessControlHttpRoutes
};
