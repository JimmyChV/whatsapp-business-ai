const targetModule = require.resolve('./domains/tenant/services/integrations.service.js');
delete require.cache[targetModule];
module.exports = require(targetModule);
