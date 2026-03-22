const securityServices = require('./services');
const securityRoutes = require('./routes');

module.exports = {
    ...securityServices,
    ...securityRoutes
};

