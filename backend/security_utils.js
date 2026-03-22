const targetModule = require.resolve('./domains/security/helpers/security-utils.js');
delete require.cache[targetModule];
module.exports = require(targetModule);

