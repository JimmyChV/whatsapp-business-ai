import { useEffect, useRef } from 'react';

const shouldEmitTransportMode = (mode = '', runtime = {}, selectedModule = null) => {
    const normalizedMode = String(mode || '').trim().toLowerCase();
    if (!normalizedMode || normalizedMode === 'idle') return false;
    const activeTransport = String(runtime?.activeTransport || '').trim().toLowerCase();
    const requestedTransport = String(runtime?.requestedTransport || '').trim().toLowerCase();
    if (activeTransport === normalizedMode || requestedTransport === normalizedMode) return false;
    const moduleTransport = String(
        selectedModule?.transportMode
        || selectedModule?.transport
        || selectedModule?.activeTransport
        || ''
    ).trim().toLowerCase();
    if (moduleTransport === normalizedMode) return false;
    return true;
};

export default function useSocketConnectionRuntimeEvents({
    socket,
    selectedTransportRef,
    waRuntimeRef,
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
    const modulesRequestedRef = useRef(false);

    useEffect(() => {
        const requestRuntimeMetadata = () => {
            if (modulesRequestedRef.current) return;
            modulesRequestedRef.current = true;
            socket.emit('get_wa_capabilities');
            socket.emit('get_wa_modules');
        };

        socket.on('connect', () => {
            setIsConnected(true);
            chatPagingRef.current.loading = false;
            setIsLoadingMoreChats(false);
            const mode = String(selectedTransportRef.current || '').trim().toLowerCase();
            if (shouldEmitTransportMode(mode, waRuntimeRef?.current, selectedWaModuleRef?.current)) {
                setIsSwitchingTransport(true);
                socket.emit('set_transport_mode', { mode });
            } else {
                setIsSwitchingTransport(false);
            }
            setTimeout(() => {
                requestChatsPage({ reset: true });
            }, 0);
            emitScopedBusinessDataRequest({
                moduleId: selectedCatalogModuleIdRef.current || selectedWaModuleRef.current?.moduleId || '',
                catalogId: selectedCatalogIdRef.current || ''
            });
            requestRuntimeMetadata();
        });

        socket.on('connect_error', (err) => {
            setIsConnected(false);
            setIsSwitchingTransport(false);
            const message = String(err?.message || '').trim();
            if (message) console.error('[socket][connect_error]', message);
        });

        socket.on('disconnect', () => {
            modulesRequestedRef.current = false;
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
            requestRuntimeMetadata();
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
            if (shouldEmitTransportMode(mode, waRuntimeRef?.current, selectedWaModuleRef?.current)) {
                setIsSwitchingTransport(true);
                socket.emit('set_transport_mode', { mode });
            } else {
                setIsSwitchingTransport(false);
            }
            setTimeout(() => {
                requestChatsPage({ reset: true });
            }, 0);
            emitScopedBusinessDataRequest({
                moduleId: selectedCatalogModuleIdRef.current || selectedWaModuleRef.current?.moduleId || '',
                catalogId: selectedCatalogIdRef.current || ''
            });
            requestRuntimeMetadata();
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
