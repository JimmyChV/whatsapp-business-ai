const targetModule = require.resolve('./domains/operations/services/ai-prompt-context.service.js');
delete require.cache[targetModule];
module.exports = require(targetModule);

