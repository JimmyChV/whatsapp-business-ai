const targetModule = require.resolve('./domains/security/services/meta-config-crypto.service.js');
delete require.cache[targetModule];
module.exports = require(targetModule);

