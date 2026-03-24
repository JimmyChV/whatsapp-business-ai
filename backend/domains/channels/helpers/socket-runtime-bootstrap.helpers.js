function createGuardRateLimit(eventRateLimiter) {
    return function guardRateLimit(socket, eventName) {
        const key = `${socket.id}:${eventName}`;
        const result = eventRateLimiter.check(key);
        if (!result.allowed) {
            socket.emit('error', `Rate limit excedido para ${eventName}. Intenta en unos segundos.`);
            return false;
        }
        return true;
    };
}

function createLazySharpLoader() {
    let sharpImageProcessor = null;
    let sharpLoadAttempted = false;
    return function getSharpImageProcessor() {
        if (sharpLoadAttempted) return sharpImageProcessor;
        sharpLoadAttempted = true;
        try {
            sharpImageProcessor = require('sharp');
        } catch (error) {
            sharpImageProcessor = null;
        }
        return sharpImageProcessor;
    };
}

module.exports = {
    createGuardRateLimit,
    createLazySharpLoader
};

