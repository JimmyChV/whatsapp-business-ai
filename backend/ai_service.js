const targetModule = require.resolve('./domains/operations/services/ai.service.js');
delete require.cache[targetModule];
module.exports = require(targetModule);

