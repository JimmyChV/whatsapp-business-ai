const operationServices = require('./services');

module.exports = {
    ...operationServices,
    opsTelemetry: require('../../ops_telemetry'),
    registerOperationsHttpRoutes: require('./http-routes').registerOperationsHttpRoutes,
    registerOperationsUtilityHttpRoutes: require('./http-routes-utility').registerOperationsUtilityHttpRoutes,
    registerOperationsHealthHttpRoutes: require('./http-routes-health').registerOperationsHealthHttpRoutes
};
