import { useMemo } from 'react';
import {
  chatIdsReferSameScope,
  normalizeWaModules
} from '../helpers/appChat.helpers';

export default function useAppDerivedChatState({
  waRuntime,
  waModules,
  selectedCatalogModuleId,
  selectedCatalogId,
  selectedTransport,
  activeChatId,
  activeChatIdRef,
  chats
} = {}) {
  const activeTransport = String(waRuntime?.activeTransport || 'idle').toLowerCase();
  const cloudConfigured = Boolean(waRuntime?.cloudConfigured);
  const selectedModeLabel = 'WhatsApp Cloud API';

  const availableWaModules = useMemo(
    () => normalizeWaModules(waModules).filter((module) => module.isActive !== false),
    [waModules]
  );

  const hasModuleCatalog = availableWaModules.length > 0;
  const activeCatalogModuleId = String(selectedCatalogModuleId || '').trim();
  const activeCatalogId = String(selectedCatalogId || '').trim().toUpperCase();

  const activeChatDetails = useMemo(() => {
    const currentActiveId = String(activeChatId || activeChatIdRef?.current || '').trim();
    if (!currentActiveId) return null;
    return (Array.isArray(chats) ? chats : []).find((chat) =>
      chatIdsReferSameScope(String(chat?.id || ''), currentActiveId)
    ) || null;
  }, [activeChatId, activeChatIdRef, chats]);

  return {
    activeTransport,
    cloudConfigured,
    selectedModeLabel,
    availableWaModules,
    hasModuleCatalog,
    activeCatalogModuleId,
    activeCatalogId,
    activeChatDetails,
    selectedTransport: String(selectedTransport || '').trim().toLowerCase()
  };
}
