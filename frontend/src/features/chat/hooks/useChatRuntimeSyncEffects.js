import { useEffect } from 'react';

export function useChatRuntimeSyncEffects({
  activeChatId,
  activeChatIdRef,
  chats,
  chatsRef,
  chatSearchQuery,
  chatSearchRef,
  chatFilters,
  chatFiltersRef,
  normalizeChatFilters,
  selectedTransport,
  selectedTransportRef,
  transportStorageKey,
  selectedWaModule,
  selectedWaModuleRef,
  waModules,
  waModulesRef,
  selectedCatalogModuleId,
  selectedCatalogModuleIdRef,
  selectedCatalogId,
  selectedCatalogIdRef,
  saasSession,
  saasSessionRef,
  persistSaasSession,
  saasRuntime,
  saasRuntimeRef,
  forceOperationLaunch,
  forceOperationLaunchRef,
  waRuntime,
  setIsClientReady,
  setTransportError,
  showClientProfile,
  clientProfilePanelRef,
  setShowClientProfile
}) {
  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId, activeChatIdRef]);

  useEffect(() => {
    chatsRef.current = chats;
  }, [chats, chatsRef]);

  useEffect(() => {
    chatSearchRef.current = String(chatSearchQuery || '').trim();
  }, [chatSearchQuery, chatSearchRef]);

  useEffect(() => {
    chatFiltersRef.current = normalizeChatFilters(chatFilters);
  }, [chatFilters, chatFiltersRef, normalizeChatFilters]);

  useEffect(() => {
    selectedTransportRef.current = selectedTransport;
    try {
      localStorage.removeItem(transportStorageKey);
    } catch (_) {
      // ignore localStorage failures
    }
  }, [selectedTransport, selectedTransportRef, transportStorageKey]);

  useEffect(() => {
    selectedWaModuleRef.current = selectedWaModule;
  }, [selectedWaModule, selectedWaModuleRef]);

  useEffect(() => {
    waModulesRef.current = Array.isArray(waModules) ? waModules : [];
  }, [waModules, waModulesRef]);

  useEffect(() => {
    selectedCatalogModuleIdRef.current = String(selectedCatalogModuleId || '').trim().toLowerCase();
  }, [selectedCatalogModuleId, selectedCatalogModuleIdRef]);

  useEffect(() => {
    selectedCatalogIdRef.current = String(selectedCatalogId || '').trim().toUpperCase();
  }, [selectedCatalogId, selectedCatalogIdRef]);

  useEffect(() => {
    saasSessionRef.current = saasSession;
    persistSaasSession(saasSession);
  }, [saasSession, saasSessionRef, persistSaasSession]);

  useEffect(() => {
    saasRuntimeRef.current = saasRuntime;
  }, [saasRuntime, saasRuntimeRef]);

  useEffect(() => {
    forceOperationLaunchRef.current = forceOperationLaunch;
  }, [forceOperationLaunch, forceOperationLaunchRef]);

  useEffect(() => {
    if (selectedTransport !== 'cloud') return;
    if (waRuntime?.activeTransport !== 'cloud') return;
    if (waRuntime?.cloudConfigured) return;
    setIsClientReady(false);
    setTransportError('Cloud API no configurada en backend/.env.');
  }, [selectedTransport, waRuntime, setIsClientReady, setTransportError]);

  useEffect(() => {
    if (!showClientProfile) return;
    const handleOutsideClick = (event) => {
      const target = event.target;
      if (clientProfilePanelRef.current?.contains(target)) return;
      setShowClientProfile(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showClientProfile, clientProfilePanelRef, setShowClientProfile]);
}
