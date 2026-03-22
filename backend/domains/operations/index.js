const operationServices = require('./services');

module.exports = {
    ...operationServices,
    registerOperationsHttpRoutes: require('./routes/http-routes').registerOperationsHttpRoutes,
    registerOperationsUtilityHttpRoutes: require('./routes/http-routes-utility').registerOperationsUtilityHttpRoutes,
    registerOperationsHealthHttpRoutes: require('./routes/http-routes-health').registerOperationsHealthHttpRoutes
};

