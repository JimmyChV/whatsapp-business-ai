module.exports = {
    ...require('./http-routes-customers'),
    ...require('./http-routes-wa-modules'),
    ...require('./http-routes-runtime-settings'),
    ...require('./http-routes-labels-quick-replies'),
    ...require('./http-routes-admin-config-catalog'),
    ...require('./http-routes-admin-tenants-users'),
    ...require('./http-routes-assets-upload'),
    ...require('./http-routes-runtime-public')
};

