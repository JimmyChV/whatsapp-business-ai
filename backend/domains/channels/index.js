const channelServices = require('./services');

module.exports = {
    ...channelServices,
    invalidateWebhookCloudRegistryCache: require('./cloud-webhook.routes').invalidateWebhookCloudRegistryCache,
    registerCloudWebhookHttpRoutes: require('./cloud-webhook.routes').registerCloudWebhookHttpRoutes
};
