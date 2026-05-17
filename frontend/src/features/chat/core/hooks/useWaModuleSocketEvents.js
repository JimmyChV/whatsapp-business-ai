import { useEffect } from 'react';
import { normalizeWaModuleItem, normalizeWaModules } from '../helpers/appChat.helpers';

export default function useWaModuleSocketEvents({
  socket,
  selectedWaModuleRef,
  selectedCatalogModuleIdRef,
  selectedCatalogIdRef,
  requestedWaModuleFromUrlRef,
  forceOperationLaunchRef,
  canManageSaasRef,
  emitScopedBusinessDataRequest,
  requestQuickRepliesForModule,
  setWaModules,
  setSelectedWaModule,
  setWaModuleError,
  setSelectedCatalogModuleId,
  setSelectedCatalogId,
  setSelectedTransport
}) {
  useEffect(() => {
    if (!socket) return;

    const syncSelectedModuleContext = (selected = null) => {
      if (!selected?.moduleId) return;
      const previousModuleId = String(selectedWaModuleRef.current?.moduleId || '').trim().toLowerCase();
      const selectedModuleId = String(selected?.moduleId || '').trim().toLowerCase();

      setSelectedWaModule(selected);
      setWaModuleError('');

      const currentCatalogModuleId = String(selectedCatalogModuleIdRef.current || '').trim().toLowerCase();
      if (!currentCatalogModuleId && selectedModuleId) {
        setSelectedCatalogModuleId(selectedModuleId);
        selectedCatalogIdRef.current = '';
        setSelectedCatalogId('');
        if (socket.connected) {
          emitScopedBusinessDataRequest({ moduleId: selectedModuleId, catalogId: '' });
        }
      }

      const selectedId = String(selected?.moduleId || '').trim().toLowerCase();
      if (selectedId && selectedId === String(requestedWaModuleFromUrlRef.current || '').trim().toLowerCase()) {
        requestedWaModuleFromUrlRef.current = '';
      }

      const selectedMode = String(selected?.transportMode || '').trim().toLowerCase();
      const shouldAutoSelectTransport = forceOperationLaunchRef.current || !canManageSaasRef.current;
      if (shouldAutoSelectTransport && selectedMode === 'cloud') {
        setSelectedTransport(selectedMode);
      }

      if (selectedModuleId && selectedModuleId !== previousModuleId) {
        requestQuickRepliesForModule(selectedModuleId);
        emitScopedBusinessDataRequest({ moduleId: selectedModuleId || selectedCatalogModuleIdRef.current, catalogId: selectedCatalogIdRef.current || '' });
      }
    };

    const handleWaModuleContext = (payload = {}) => {
      const modules = normalizeWaModules(payload?.modules || payload?.items || payload?.waModules || []);
      const selected = normalizeWaModuleItem(payload?.selected || payload?.selectedModule || payload?.item || null);
      if (modules.length) setWaModules(modules);
      if (selected?.moduleId) syncSelectedModuleContext(selected);
    };

    const handleWaModuleSelected = (payload) => {
      const selected = normalizeWaModuleItem(payload?.selected || payload?.item || payload || null);
      if (!selected?.moduleId) return;

      setWaModules((prev) => {
        const base = normalizeWaModules(prev || []);
        const hasExisting = base.some((item) => item.moduleId === selected.moduleId);
        const merged = hasExisting
          ? base.map((item) => (item.moduleId === selected.moduleId ? { ...item, ...selected, isSelected: true } : { ...item, isSelected: false }))
          : [{ ...selected, isSelected: true }, ...base.map((item) => ({ ...item, isSelected: false }))];
        return normalizeWaModules(merged);
      });
      syncSelectedModuleContext(selected);
    };

    const handleWaModuleError = (message) => {
      setWaModuleError(String(message || 'No se pudo actualizar el modulo WhatsApp.'));
    };

    socket.on('wa_module_context', handleWaModuleContext);
    socket.on('wa_module_selected', handleWaModuleSelected);
    socket.on('wa_module_error', handleWaModuleError);

    return () => {
      socket.off('wa_module_context', handleWaModuleContext);
      socket.off('wa_module_selected', handleWaModuleSelected);
      socket.off('wa_module_error', handleWaModuleError);
    };
  }, [
    canManageSaasRef,
    emitScopedBusinessDataRequest,
    forceOperationLaunchRef,
    requestQuickRepliesForModule,
    requestedWaModuleFromUrlRef,
    selectedCatalogIdRef,
    selectedCatalogModuleIdRef,
    selectedWaModuleRef,
    setSelectedCatalogId,
    setSelectedCatalogModuleId,
    setSelectedTransport,
    setSelectedWaModule,
    setWaModuleError,
    setWaModules,
    socket
  ]);
}
