const targetModule = require.resolve('./domains/tenant/services/tenant-control.service.js');
delete require.cache[targetModule];
module.exports = require(targetModule);

