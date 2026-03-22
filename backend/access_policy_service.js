const targetModule = require.resolve('./domains/security/services/access-policy.service.js');
delete require.cache[targetModule];
module.exports = require(targetModule);
