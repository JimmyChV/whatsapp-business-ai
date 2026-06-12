module.exports = {
    ...require('./http-routes'),
    ...require('./http-routes-orders'),
    ...require('./http-routes-scheduled-messages'),
    ...require('./http-routes-reports'),
    ...require('./http-routes-utility'),
    ...require('./http-routes-health')
};

