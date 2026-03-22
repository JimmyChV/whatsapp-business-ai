import { useCallback } from 'react';

const DEFAULT_RUNTIME = {
  requestedTransport: 'idle',
  activeTransport: 'idle',
  cloudConfigured: false,
  cloudReady: false,
  availableTransports: ['cloud']
};

export default function useTransportSelectionActions({
  socket,
  isConnected,
  chatPagingRef,
  setSelectedTransport,
  setTransportError,
  setIsSwitchingTransport,
  setIsClientReady,
  setQrCode,
  setChats,
  setChatsTotal,
  setChatsHasMore,
  setMessages,
  setActiveChatId,
  setEditingMessage,
  setReplyingMessage,
  setShowClientProfile,
  setClientContact,
  setWaModuleError,
  setWaRuntime
} = {}) {
  const resetChatRuntime = useCallback(() => {
    setChats([]);
    setChatsTotal(0);
    setChatsHasMore(true);
    if (chatPagingRef?.current) {
      chatPagingRef.current = { offset: 0, hasMore: true, loading: false };
    }
    setMessages([]);
    setActiveChatId(null);
    setEditingMessage(null);
    setReplyingMessage(null);
    setShowClientProfile(false);
    setClientContact(null);
  }, [
    chatPagingRef,
    setActiveChatId,
    setChats,
    setChatsHasMore,
    setChatsTotal,
    setClientContact,
    setEditingMessage,
    setMessages,
    setReplyingMessage,
    setShowClientProfile
  ]);

  const handleSelectTransport = useCallback((mode) => {
    const safeMode = String(mode || '').trim().toLowerCase();
    if (safeMode !== 'cloud') return;

    setSelectedTransport(safeMode);
    setTransportError('');
    setIsSwitchingTransport(true);
    setIsClientReady(false);
    setQrCode('');

    resetChatRuntime();

    if (isConnected) {
      socket.emit('set_transport_mode', { mode: safeMode });
    }
  }, [
    isConnected,
    resetChatRuntime,
    setIsClientReady,
    setIsSwitchingTransport,
    setQrCode,
    setSelectedTransport,
    setTransportError,
    socket
  ]);

  const handleResetTransportSelection = useCallback(() => {
    if (isConnected) {
      socket.emit('set_transport_mode', { mode: 'idle' });
    }

    setSelectedTransport('');
    setTransportError('');
    setWaModuleError('');
    setIsSwitchingTransport(false);
    setIsClientReady(false);
    setQrCode('');
    setWaRuntime(DEFAULT_RUNTIME);

    resetChatRuntime();
  }, [
    isConnected,
    resetChatRuntime,
    setIsClientReady,
    setIsSwitchingTransport,
    setQrCode,
    setSelectedTransport,
    setTransportError,
    setWaModuleError,
    setWaRuntime,
    socket
  ]);

  return {
    handleSelectTransport,
    handleResetTransportSelection
  };
}
