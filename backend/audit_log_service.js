const targetModule = require.resolve('./domains/security/services/audit-log.service.js');
delete require.cache[targetModule];
module.exports = require(targetModule);
