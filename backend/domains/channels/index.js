const channelServices = require('./services');
const channelRoutes = require('./routes');

module.exports = {
    ...channelServices,
    ...channelRoutes
};

