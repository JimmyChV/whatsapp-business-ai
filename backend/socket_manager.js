const targetModule = require.resolve('./domains/channels/services/socket-manager.service.js');
delete require.cache[targetModule];
module.exports = require(targetModule);

