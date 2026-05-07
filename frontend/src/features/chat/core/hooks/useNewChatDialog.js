import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getBestChatPhone,
  normalizeDigits,
  normalizeWaModules,
  parseScopedChatId
} from '../helpers/appChat.helpers';
import { searchTenantCustomersForChat } from '../services/customerSearch.service';

export function useNewChatDialog({
  apiUrl = '',
  buildApiHeaders,
  activeTenantId = '',
  waModulesRef,
  selectedWaModuleRef,
  chatsRef,
  handleChatSelect,
  socket
}) {
  const [newChatDialog, setNewChatDialog] = useState({
    open: false,
    query: '',
    phone: '',
    firstMessage: '',
    moduleId: '',
    error: '',
    loading: false,
    selectedCustomerOptionKey: '',
    customerOptions: []
  });
  const searchRequestRef = useRef(0);

  const resolveNewChatAvailableModules = useCallback(() => (
    normalizeWaModules(waModulesRef.current).filter((module) => module.isActive !== false)
  ), [waModulesRef]);

  const resolveDefaultNewChatModuleId = useCallback((availableModules = []) => {
    const preferredModuleId = String(selectedWaModuleRef.current?.moduleId || '').trim().toLowerCase();
    if (availableModules.length === 1) {
      return String(availableModules[0]?.moduleId || '').trim().toLowerCase();
    }
    if (preferredModuleId) {
      const preferred = availableModules.find((module) => String(module?.moduleId || '').trim().toLowerCase() === preferredModuleId);
      if (preferred?.moduleId) return String(preferred.moduleId || '').trim().toLowerCase();
    }
    return String(availableModules[0]?.moduleId || '').trim().toLowerCase();
  }, [selectedWaModuleRef]);

  const resetNewChatDialog = useCallback(() => {
    setNewChatDialog({
      open: false,
      query: '',
      phone: '',
      firstMessage: '',
      moduleId: '',
      error: '',
      loading: false,
      selectedCustomerOptionKey: '',
      customerOptions: []
    });
  }, []);

  const loadCustomerSearchResults = useCallback(async (query) => searchTenantCustomersForChat({
    apiUrl,
    buildApiHeaders,
    tenantId: activeTenantId,
    query,
    waModules: resolveNewChatAvailableModules()
  }), [activeTenantId, apiUrl, buildApiHeaders, resolveNewChatAvailableModules]);

  const executeStartNewChat = useCallback(({ normalizedPhone = '', firstMessage = '', targetModuleId = '' } = {}) => {
    const cleanPhone = normalizeDigits(normalizedPhone);
    const cleanModuleId = String(targetModuleId || '').trim().toLowerCase();
    if (!cleanPhone) return;

    const candidates = chatsRef.current
      .filter((chat) => {
        const chatPhone = normalizeDigits(getBestChatPhone(chat) || '');
        if (!chatPhone || chatPhone !== cleanPhone) return false;
        if (!cleanModuleId) return true;
        const scoped = parseScopedChatId(chat?.id || '');
        const chatModuleId = String(scoped.scopeModuleId || chat?.lastMessageModuleId || '').trim().toLowerCase();
        return chatModuleId === cleanModuleId;
      })
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    if (candidates.length > 0) {
      const best = candidates[0];
      if (best?.id) {
        handleChatSelect(best.id, { clearSearch: true });
        if (String(firstMessage || '').trim()) {
          socket.emit('send_message', {
            to: best.id,
            toPhone: cleanPhone,
            body: String(firstMessage || '').trim()
          });
        }
        return;
      }
    }

    socket.emit('start_new_chat', {
      phone: cleanPhone,
      firstMessage: String(firstMessage || '').trim(),
      moduleId: cleanModuleId || undefined
    });
  }, [chatsRef, handleChatSelect, socket]);

  const openStartNewChatDialog = useCallback((phoneArg = '', firstMessageArg = '') => {
    const availableModules = resolveNewChatAvailableModules();
    const defaultModuleId = resolveDefaultNewChatModuleId(availableModules);
    const initialQuery = String(phoneArg || '').trim();
    setNewChatDialog({
      open: true,
      query: initialQuery,
      phone: initialQuery,
      firstMessage: typeof firstMessageArg === 'string' ? firstMessageArg : '',
      moduleId: defaultModuleId || '',
      error: '',
      loading: false,
      selectedCustomerOptionKey: '',
      customerOptions: []
    });
  }, [resolveDefaultNewChatModuleId, resolveNewChatAvailableModules]);

  const handleStartNewChat = useCallback((phoneArg = '', firstMessageArg = '', options = {}) => {
    const targetModuleId = String(options?.moduleId || '').trim().toLowerCase();
    const autoConfirm = options?.autoConfirm === true;
    if (autoConfirm) {
      executeStartNewChat({
        normalizedPhone: phoneArg,
        firstMessage: firstMessageArg,
        targetModuleId
      });
      return;
    }
    openStartNewChatDialog(phoneArg, firstMessageArg);
  }, [executeStartNewChat, openStartNewChatDialog]);

  const handleCancelNewChatDialog = useCallback(() => {
    resetNewChatDialog();
  }, [resetNewChatDialog]);

  const handleSelectNewChatCustomerOption = useCallback((option = null) => {
    const nextPhone = String(option?.phone || option?.phoneAlt || '').trim();
    const nextModuleId = String(option?.moduleId || '').trim().toLowerCase();
    setNewChatDialog((prev) => ({
      ...prev,
      selectedCustomerOptionKey: String(option?.key || '').trim(),
      phone: nextPhone || prev.phone,
      moduleId: nextModuleId || prev.moduleId,
      error: ''
    }));
  }, []);

  const handleConfirmNewChat = useCallback(() => {
    const normalizedPhone = normalizeDigits(newChatDialog.phone || '');
    if (!normalizedPhone || normalizedPhone.length < 8) {
      setNewChatDialog((prev) => ({ ...prev, error: 'Ingresa un numero valido con codigo de pais.' }));
      return;
    }

    const availableModules = resolveNewChatAvailableModules();
    const selectedModuleId = String(newChatDialog.moduleId || '').trim().toLowerCase();
    const defaultModuleId = resolveDefaultNewChatModuleId(availableModules);
    let targetModuleId = selectedModuleId || defaultModuleId;

    if (availableModules.length > 0) {
      const moduleIsValid = availableModules.some((module) => String(module?.moduleId || '').trim().toLowerCase() === targetModuleId);
      if (!moduleIsValid) {
        setNewChatDialog((prev) => ({ ...prev, error: 'Selecciona un modulo activo para iniciar el chat.' }));
        return;
      }
    } else {
      const preferredModuleId = String(selectedWaModuleRef.current?.moduleId || '').trim().toLowerCase();
      targetModuleId = preferredModuleId || '';
    }

    executeStartNewChat({
      normalizedPhone,
      firstMessage: newChatDialog.firstMessage || '',
      targetModuleId
    });
    resetNewChatDialog();
  }, [
    executeStartNewChat,
    newChatDialog.firstMessage,
    newChatDialog.moduleId,
    newChatDialog.phone,
    resetNewChatDialog,
    resolveDefaultNewChatModuleId,
    resolveNewChatAvailableModules,
    selectedWaModuleRef
  ]);

  useEffect(() => {
    if (!newChatDialog.open) return undefined;
    const query = String(newChatDialog.query || '').trim();
    if (query.length < 2) {
      setNewChatDialog((prev) => (
        prev.customerOptions.length === 0 && prev.loading === false
          ? prev
          : { ...prev, loading: false, customerOptions: [], selectedCustomerOptionKey: '' }
      ));
      return undefined;
    }

    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    const timerId = setTimeout(() => {
      setNewChatDialog((prev) => ({ ...prev, loading: true, error: '' }));
      loadCustomerSearchResults(query)
        .then((options) => {
          if (searchRequestRef.current !== requestId) return;
          setNewChatDialog((prev) => {
            const selectedKey = options.some((entry) => entry.key === prev.selectedCustomerOptionKey)
              ? prev.selectedCustomerOptionKey
              : '';
            return {
              ...prev,
              loading: false,
              customerOptions: options,
              selectedCustomerOptionKey: selectedKey
            };
          });
        })
        .catch((error) => {
          if (searchRequestRef.current !== requestId) return;
          setNewChatDialog((prev) => ({
            ...prev,
            loading: false,
            customerOptions: [],
            selectedCustomerOptionKey: '',
            error: String(error?.message || 'No se pudieron buscar clientes.')
          }));
        });
    }, 250);

    return () => clearTimeout(timerId);
  }, [loadCustomerSearchResults, newChatDialog.open, newChatDialog.query]);

  const newChatAvailableModules = useMemo(() => resolveNewChatAvailableModules(), [resolveNewChatAvailableModules]);

  return {
    newChatDialog,
    setNewChatDialog,
    newChatAvailableModules,
    handleStartNewChat,
    handleSelectNewChatCustomerOption,
    handleCancelNewChatDialog,
    handleConfirmNewChat
  };
}
