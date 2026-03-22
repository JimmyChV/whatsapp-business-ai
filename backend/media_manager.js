const targetModule = require.resolve('./domains/channels/services/media-manager.service.js');
delete require.cache[targetModule];
module.exports = require(targetModule);

