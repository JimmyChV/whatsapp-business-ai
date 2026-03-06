const waClient = require('./whatsapp_client');

const requestedTransport = String(process.env.WA_TRANSPORT || 'webjs').trim().toLowerCase();
const cloudRequested = requestedTransport === 'cloud';

const cloudConfigured = Boolean(
    process.env.META_WABA_PHONE_NUMBER_ID
    && process.env.META_SYSTEM_USER_TOKEN
    && process.env.META_APP_ID
);

let activeTransport = 'webjs';

if (cloudRequested) {
    // Cloud provider is planned next. Keep runtime stable by using webjs until cloud adapter is implemented.
    console.warn('[WA][Provider] WA_TRANSPORT=cloud requested but cloud adapter is not enabled yet. Falling back to webjs.');
}

function getRuntimeInfo() {
    return {
        requestedTransport,
        activeTransport,
        cloudRequested,
        cloudConfigured,
        cloudReady: false,
        migrationReady: true
    };
}

waClient.getRuntimeInfo = getRuntimeInfo;
waClient.getTransportMode = () => activeTransport;
waClient.getRequestedTransport = () => requestedTransport;

module.exports = waClient;
