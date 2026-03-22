const targetModule = require.resolve('./domains/operations/services/ops-telemetry.service.js');
delete require.cache[targetModule];
module.exports = require(targetModule);

