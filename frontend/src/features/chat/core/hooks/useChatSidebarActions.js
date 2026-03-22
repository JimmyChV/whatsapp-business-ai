export default function useChatSidebarActions({
  waModules = [],
  setWaModuleError,
  setSelectedWaModule,
  setSelectedTransport,
  setTransportError,
  isConnected = false,
  requestQuickRepliesForModule,
  socket,
  emitScopedBusinessDataRequest,
  selectedCatalogModuleIdRef,
  selectedCatalogIdRef,
  selectedWaModuleRef,
  setSelectedCatalogModuleId,
  setSelectedCatalogId,
  setBusinessData,
  handleSelectTransport,
  saasSessionRef,
  saasRuntimeRef,
  tenantScopeId = 'default',
  apiUrl = '',
  buildApiHeaders,
  requestChatsPage,
  setChatSearchQuery,
  setChatFilters,
  normalizeChatFilters,
  canManageSaas = false,
  handleOpenSaasAdminWorkspace,
  setOpenCompanyProfileToken,
  chats = [],
  setPendingOrderCartLoad
} = {}) {
  const handleSelectWaModule = (moduleId = '') => {
    const safeModuleId = String(moduleId || '').trim();
    if (!safeModuleId) return;

    const nextModule = (Array.isArray(waModules) ? waModules : [])
      .find((item) => String(item?.moduleId || '').trim() === safeModuleId);
    if (!nextModule) {
      setWaModuleError('No se encontro el modulo seleccionado.');
      return;
    }

    const moduleTransport = String(nextModule?.transportMode || '').trim().toLowerCase();
    const normalizedTransport = moduleTransport === 'cloud' ? 'cloud' : 'cloud';

    setSelectedWaModule(nextModule);
    setSelectedTransport(normalizedTransport);
    setTransportError('');
    setWaModuleError('');

    if (isConnected) {
      requestQuickRepliesForModule(nextModule.moduleId);
      socket.emit('set_wa_module', { moduleId: nextModule.moduleId });
      return;
    }

    handleSelectTransport(normalizedTransport);
  };

  const handleSelectCatalogModule = (moduleId = '') => {
    const safeModuleId = String(moduleId || '').trim().toLowerCase();
    if (!safeModuleId) return;

    const moduleExists = (Array.isArray(waModules) ? waModules : [])
      .some((item) => String(item?.moduleId || '').trim().toLowerCase() === safeModuleId && item?.isActive !== false);
    if (!moduleExists) {
      setWaModuleError('No se encontro el modulo para ese catalogo.');
      return;
    }

    selectedCatalogModuleIdRef.current = safeModuleId;
    selectedCatalogIdRef.current = '';
    setSelectedCatalogModuleId(safeModuleId);
    setSelectedCatalogId('');
    setBusinessData((prev) => ({
      ...prev,
      catalog: [],
      catalogMeta: {
        ...(prev?.catalogMeta || { source: 'local', nativeAvailable: false }),
        scope: {
          ...(prev?.catalogMeta?.scope || {}),
          moduleId: safeModuleId,
          catalogId: ''
        }
      }
    }));
    if (isConnected) {
      requestQuickRepliesForModule(safeModuleId);
      emitScopedBusinessDataRequest({ moduleId: safeModuleId, catalogId: '' });
    }
  };

  const handleSelectCatalog = (catalogId = '') => {
    const safeCatalogId = String(catalogId || '').trim().toUpperCase();
    const safeModuleId = String(selectedCatalogModuleIdRef.current || '').trim().toLowerCase();
    if (!safeModuleId) return;
    selectedCatalogIdRef.current = safeCatalogId;
    setSelectedCatalogId(safeCatalogId);
    setBusinessData((prev) => ({
      ...prev,
      catalog: [],
      catalogMeta: {
        ...(prev?.catalogMeta || { source: 'local', nativeAvailable: false }),
        scope: {
          ...(prev?.catalogMeta?.scope || {}),
          moduleId: safeModuleId,
          catalogId: safeCatalogId || ''
        }
      }
    }));
    if (isConnected) {
      emitScopedBusinessDataRequest({
        moduleId: safeModuleId,
        catalogId: safeCatalogId || ''
      });
    }
  };

  const handleUploadCatalogImage = async ({ dataUrl, fileName, scope = '' } = {}) => {
    const safeDataUrl = String(dataUrl || '').trim();
    if (!safeDataUrl) throw new Error('No se recibio imagen para subir.');

    const tenantId = String(saasSessionRef.current?.user?.tenantId || saasRuntimeRef.current?.tenant?.id || tenantScopeId || 'default').trim() || 'default';
    const moduleId = String(selectedCatalogModuleIdRef.current || selectedWaModuleRef.current?.moduleId || '').trim().toLowerCase();
    const scopeSuffix = moduleId ? `catalog-${moduleId}` : 'catalog';
    const safeScope = String(scope || scopeSuffix).trim() || scopeSuffix;

    const response = await fetch(`${apiUrl}/api/admin/saas/assets/upload`, {
      method: 'POST',
      headers: buildApiHeaders({ includeJson: true }),
      body: JSON.stringify({
        tenantId,
        scope: safeScope,
        fileName: String(fileName || 'producto').trim() || 'producto',
        dataUrl: safeDataUrl
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      throw new Error(String(payload?.error || 'No se pudo subir la imagen.'));
    }

    const url = String(payload?.file?.url || payload?.file?.relativeUrl || '').trim();
    if (!url) throw new Error('El servidor no devolvio URL para la imagen.');
    return {
      url,
      relativeUrl: String(payload?.file?.relativeUrl || '').trim() || null,
      mimeType: String(payload?.file?.mimeType || '').trim() || null,
      sizeBytes: Number(payload?.file?.sizeBytes || 0) || 0
    };
  };

  const handleRefreshChats = () => {
    requestChatsPage({ reset: true });
  };

  const handleChatSearchChange = (value) => {
    setChatSearchQuery(String(value || ''));
  };

  const handleChatFiltersChange = (nextFilters = {}) => {
    const normalized = typeof normalizeChatFilters === 'function'
      ? normalizeChatFilters(nextFilters)
      : nextFilters;
    setChatFilters(normalized);
  };

  const handleLoadMoreChats = () => {
    requestChatsPage({ reset: false });
  };

  const handleCreateLabel = () => {
    if (!canManageSaas) {
      alert('No tienes permisos para gestionar etiquetas.');
      return;
    }
    handleOpenSaasAdminWorkspace({ tenantId: tenantScopeId, section: 'saas_etiquetas' });
  };

  const handleOpenCompanyProfile = () => {
    setOpenCompanyProfileToken((prev) => prev + 1);
  };

  const handleToggleChatLabel = (chatId, labelId) => {
    if (!chatId || labelId === undefined || labelId === null || labelId === '') return;
    const chat = chats.find((c) => c.id === chatId);
    const current = Array.isArray(chat?.labels) ? chat.labels : [];

    const idStr = String(labelId);
    const has = current.some((l) => String(l?.id || l?.labelId || '') === idStr);
    const nextIds = has
      ? current
        .filter((l) => String(l?.id || l?.labelId || '') !== idStr)
        .map((l) => String(l?.id || l?.labelId || '').trim())
        .filter(Boolean)
      : [
        ...current
          .map((l) => String(l?.id || l?.labelId || '').trim())
          .filter(Boolean),
        idStr
      ];

    socket.emit('set_chat_labels', { chatId, labelIds: nextIds });
  };

  const handleToggleChatPinned = (chatId, nextPinned) => {
    if (!chatId || typeof nextPinned !== 'boolean') return;
    socket.emit('set_chat_state', { chatId, pinned: nextPinned });
  };

  const handleLoadOrderToCart = (activeChatId, orderPayload) => {
    if (!activeChatId || !orderPayload || typeof orderPayload !== 'object') return;
    const token = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    setPendingOrderCartLoad({
      token,
      chatId: String(activeChatId),
      order: orderPayload
    });
  };

  return {
    handleSelectWaModule,
    handleSelectCatalogModule,
    handleSelectCatalog,
    handleUploadCatalogImage,
    handleRefreshChats,
    handleChatSearchChange,
    handleChatFiltersChange,
    handleLoadMoreChats,
    handleCreateLabel,
    handleOpenCompanyProfile,
    handleToggleChatLabel,
    handleToggleChatPinned,
    handleLoadOrderToCart
  };
}
