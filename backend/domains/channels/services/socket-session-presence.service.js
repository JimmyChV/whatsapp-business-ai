function createSocketSessionPresenceService({
    waClient
} = {}) {
    const registerSessionPresenceHandlers = ({
        socket,
        authzAudit
    } = {}) => {
        socket.on('logout_whatsapp', async () => {
            if (!authzAudit.requireRole(['owner', 'admin'], { errorEvent: 'error', action: 'cerrar sesion de WhatsApp' })) return;
            try {
                await waClient.client.logout();
            } catch (e) {
                console.error('logout_whatsapp error:', e.message);
            }
            try {
                waClient.isReady = false;
                await waClient.initialize();
            } catch (e) {
                console.error('reinitialize after logout failed:', e.message);
            }
            socket.emit('logout_done', { ok: true });
            await authzAudit.auditSocketAction('wa.logout.requested', {
                resourceType: 'wa_runtime',
                resourceId: 'logout',
                payload: {}
            });
        });

        socket.on('disconnect', () => {
            console.log('Web client disconnected:', socket.id);
        });
    };

    return {
        registerSessionPresenceHandlers
    };
}

module.exports = {
    createSocketSessionPresenceService
};
