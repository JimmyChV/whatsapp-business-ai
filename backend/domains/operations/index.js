const operationServices = require('./services');

module.exports = {
    ...operationServices,
    opsTelemetry: require('../../ops_telemetry'),
    registerOperationsHttpRoutes: require('./routes/http-routes').registerOperationsHttpRoutes,
    registerOperationsUtilityHttpRoutes: require('./routes/http-routes-utility').registerOperationsUtilityHttpRoutes,
    registerOperationsHealthHttpRoutes: require('./routes/http-routes-health').registerOperationsHealthHttpRoutes
};
