import { useEffect } from 'react';

export default function useSocketConnectionRuntimeEvents({
    socket,
    selectedTransportRef,
    setIsConnected,
    setIsSwitchingTransport,
    setIsLoadingMoreChats,
    chatPagingRef,
    setIsClientReady,
    requestChatsPage,
    emitScopedBusinessDataRequest,
    selectedCatalogModuleIdRef,
    selectedWaModuleRef,
    selectedCatalogIdRef,
    requestQuickRepliesForModule,
    normalizeProfilePayload,
    setMyProfile,
    setWaCapabilities,
    setWaRuntime,
    setTransportError
}) {
    useEffect(() => {
        socket.on('connect', () => {
            setIsConnected(true);
            const mode = String(selectedTransportRef.current || '').trim().toLowerCase();
            if (mode && mode !== 'idle') {
                setIsSwitchingTransport(true);
                socket.emit('set_transport_mode', { mode });
            } else {
                setIsSwitchingTransport(false);
            }
            setTimeout(() => {
                requestChatsPage({ reset: true });
            }, 0);
            socket.emit('get_wa_capabilities');
            socket.emit('get_wa_modules');
        });

        socket.on('connect_error', (err) => {
            setIsConnected(false);
            setIsSwitchingTransport(false);
            const message = String(err?.message || '').trim();
            if (message) console.error('[socket][connect_error]', message);
        });

        socket.on('disconnect', () => {
            setIsConnected(false);
            setIsSwitchingTransport(false);
            chatPagingRef.current.loading = false;
            setIsLoadingMoreChats(false);
        });

        socket.on('ready', () => {
            setIsClientReady(true);
            setIsSwitchingTransport(false);
            setTimeout(() => {
                requestChatsPage({ reset: true });
            }, 0);
            emitScopedBusinessDataRequest({
                moduleId: selectedCatalogModuleIdRef.current || selectedWaModuleRef.current?.moduleId || '',
                catalogId: selectedCatalogIdRef.current || ''
            });
            socket.emit('get_my_profile');
            socket.emit('get_wa_capabilities');
            socket.emit('get_wa_modules');
        });

        socket.on('my_profile', (profile) => {
            setMyProfile(normalizeProfilePayload(profile));
        });

        socket.on('wa_capabilities', (caps) => {
            const nextCaps = {
                messageEdit: Boolean(caps?.messageEdit),
                messageEditSync: Boolean(caps?.messageEditSync),
                messageForward: Boolean(caps?.messageForward),
                messageDelete: Boolean(caps?.messageDelete),
                messageReply: Boolean(caps?.messageReply)
            };
            setWaCapabilities((prev) => ({ ...prev, ...nextCaps }));
            requestQuickRepliesForModule(selectedCatalogModuleIdRef.current || selectedWaModuleRef.current?.moduleId || '');
        });

        socket.on('wa_runtime', (runtime) => {
            const nextRuntime = runtime && typeof runtime === 'object' ? runtime : {};
            setWaRuntime((prev) => ({
                ...prev,
                ...nextRuntime,
                availableTransports: Array.isArray(nextRuntime?.availableTransports)
                    ? nextRuntime.availableTransports
                    : (prev?.availableTransports || ['cloud'])
            }));
        });

        socket.on('transport_mode_set', (runtime) => {
            const nextRuntime = runtime && typeof runtime === 'object' ? runtime : {};
            setWaRuntime((prev) => ({
                ...prev,
                ...nextRuntime,
                availableTransports: Array.isArray(nextRuntime?.availableTransports)
                    ? nextRuntime.availableTransports
                    : (prev?.availableTransports || ['cloud'])
            }));
            setTransportError('');
            setIsSwitchingTransport(false);
        });

        socket.on('transport_mode_error', (msg) => {
            setIsSwitchingTransport(false);
            setIsClientReady(false);
            setTransportError(String(msg || 'No se pudo cambiar el modo de transporte.'));
        });

        if (socket.connected) {
            setIsConnected(true);
            const mode = String(selectedTransportRef.current || '').trim().toLowerCase();
            if (mode && mode !== 'idle') {
                setIsSwitchingTransport(true);
                socket.emit('set_transport_mode', { mode });
            } else {
                setIsSwitchingTransport(false);
            }
            setTimeout(() => {
                requestChatsPage({ reset: true });
            }, 0);
            socket.emit('get_wa_capabilities');
            socket.emit('get_wa_modules');
        }

        return () => {
            [
                'connect',
                'connect_error',
                'disconnect',
                'ready',
                'my_profile',
                'wa_capabilities',
                'wa_runtime',
                'transport_mode_set',
                'transport_mode_error'
            ].forEach((eventName) => socket.off(eventName));
        };
    }, []);
}
