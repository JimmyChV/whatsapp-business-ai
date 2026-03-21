import { useCallback } from 'react';

export default function useScopedBusinessRequests({
  socket,
  selectedCatalogModuleIdRef,
  selectedWaModuleRef,
  selectedCatalogIdRef,
  quickRepliesRequestRef,
  businessDataRequestDebounceRef,
  businessDataScopeCacheRef,
  businessDataRequestSeqRef,
  setBusinessData
}) {
  const requestQuickRepliesForModule = useCallback((moduleId = '') => {
    if (!socket.connected) return;
    const cleanModuleId = String(
      moduleId
      || selectedCatalogModuleIdRef.current
      || selectedWaModuleRef.current?.moduleId
      || ''
    ).trim().toLowerCase();
    const now = Date.now();
    const cache = quickRepliesRequestRef.current || { key: '', at: 0 };
    if (cache.key === cleanModuleId && (now - cache.at) < 250) return;
    quickRepliesRequestRef.current = { key: cleanModuleId, at: now };
    socket.emit('get_quick_replies', cleanModuleId ? { moduleId: cleanModuleId } : {});
  }, [quickRepliesRequestRef, selectedCatalogModuleIdRef, selectedWaModuleRef, socket]);

  const emitScopedBusinessDataRequest = useCallback((scope = {}) => {
    if (!socket.connected) return;
    const requestedModuleId = String(
      scope?.moduleId
      || selectedCatalogModuleIdRef.current
      || selectedWaModuleRef.current?.moduleId
      || ''
    ).trim().toLowerCase();
    const requestedCatalogId = String(
      scope?.catalogId
      || selectedCatalogIdRef.current
      || ''
    ).trim().toUpperCase();
    const dedupeKey = `${requestedModuleId}|${requestedCatalogId}`;
    const now = Date.now();
    const dedupe = businessDataRequestDebounceRef.current || { key: '', at: 0 };
    if (dedupe.key === dedupeKey && (now - dedupe.at) < 220) return;
    businessDataRequestDebounceRef.current = { key: dedupeKey, at: now };

    const cachedScope = businessDataScopeCacheRef.current.get(dedupeKey);
    if (cachedScope && Array.isArray(cachedScope.catalog)) {
      setBusinessData((prev) => ({
        ...prev,
        catalog: cachedScope.catalog,
        catalogMeta: cachedScope.catalogMeta || prev?.catalogMeta || { source: 'local', nativeAvailable: false }
      }));
    }

    const payload = {};
    if (requestedModuleId) payload.moduleId = requestedModuleId;
    if (requestedCatalogId) payload.catalogId = requestedCatalogId;
    const requestSeq = (businessDataRequestSeqRef.current || 0) + 1;
    businessDataRequestSeqRef.current = requestSeq;
    payload.requestSeq = requestSeq;
    socket.emit('get_business_data', payload);
  }, [
    businessDataRequestDebounceRef,
    businessDataRequestSeqRef,
    businessDataScopeCacheRef,
    selectedCatalogIdRef,
    selectedCatalogModuleIdRef,
    selectedWaModuleRef,
    setBusinessData,
    socket
  ]);

  return {
    requestQuickRepliesForModule,
    emitScopedBusinessDataRequest
  };
}
