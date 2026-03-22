const targetModule = require.resolve('./domains/channels/services/whatsapp-cloud-client.service.js');
delete require.cache[targetModule];
module.exports = require(targetModule);
