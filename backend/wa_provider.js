const targetModule = require.resolve('./domains/channels/services/wa-provider.service.js');
delete require.cache[targetModule];
module.exports = require(targetModule);
