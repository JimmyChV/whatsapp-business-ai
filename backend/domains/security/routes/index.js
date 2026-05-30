module.exports = {
    ...require('./http-routes-auth'),
    ...require('./http-routes-access-control'),
    ...require('./http-routes-push')
};

