const targetModule = require.resolve('./domains/security/services/email.service.js');
delete require.cache[targetModule];
module.exports = require(targetModule);

