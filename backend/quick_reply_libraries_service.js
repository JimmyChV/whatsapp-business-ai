const targetModule = require.resolve('./domains/tenant/services/quick-reply-libraries.service.js');
delete require.cache[targetModule];
module.exports = require(targetModule);
