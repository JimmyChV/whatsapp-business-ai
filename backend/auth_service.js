const targetModule = require.resolve('./domains/security/services/auth.service.js');
delete require.cache[targetModule];
module.exports = require(targetModule);
