module.exports = {
    invalidateWebhookCloudRegistryCache: require('./cloud-webhook.routes').invalidateWebhookCloudRegistryCache,
    registerCloudWebhookHttpRoutes: require('./cloud-webhook.routes').registerCloudWebhookHttpRoutes
};
