import { useCallback, useMemo, useState } from 'react';
import {
  getBestChatPhone,
  normalizeDigits,
  normalizeWaModules,
  parseScopedChatId
} from '../helpers/appChat.helpers';

export function useNewChatDialog({
  waModulesRef,
  selectedWaModuleRef,
  chatsRef,
  handleChatSelect,
  socket
}) {
  const [newChatDialog, setNewChatDialog] = useState({
    open: false,
    phone: '',
    firstMessage: '',
    moduleId: '',
    error: ''
  });

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
      phone: '',
      firstMessage: '',
      moduleId: '',
      error: ''
    });
  }, []);

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
    setNewChatDialog({
      open: true,
      phone: String(phoneArg || '').trim(),
      firstMessage: typeof firstMessageArg === 'string' ? firstMessageArg : '',
      moduleId: defaultModuleId || '',
      error: ''
    });
  }, [resolveDefaultNewChatModuleId, resolveNewChatAvailableModules]);

  const handleStartNewChat = useCallback((phoneArg = '', firstMessageArg = '') => {
    openStartNewChatDialog(phoneArg, firstMessageArg);
  }, [openStartNewChatDialog]);

  const handleCancelNewChatDialog = useCallback(() => {
    resetNewChatDialog();
  }, [resetNewChatDialog]);

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

  const newChatAvailableModules = useMemo(() => resolveNewChatAvailableModules(), [resolveNewChatAvailableModules]);

  return {
    newChatDialog,
    setNewChatDialog,
    newChatAvailableModules,
    handleStartNewChat,
    handleCancelNewChatDialog,
    handleConfirmNewChat
  };
}
