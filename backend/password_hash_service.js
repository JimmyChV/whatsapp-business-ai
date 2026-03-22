const targetModule = require.resolve('./domains/security/services/password-hash.service.js');
delete require.cache[targetModule];
module.exports = require(targetModule);
