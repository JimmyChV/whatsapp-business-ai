const targetModule = require.resolve('./domains/tenant/services/woocommerce.service.js');
delete require.cache[targetModule];
module.exports = require(targetModule);

