const operationServices = require('./services');
const operationRoutes = require('./routes');

module.exports = {
    ...operationServices,
    ...operationRoutes
};

