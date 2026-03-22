export { createSocketClient } from './services/socketClient';

export { useNewChatDialog } from './hooks/useNewChatDialog';
export { useMessagesAutoScroll } from './hooks/useMessagesAutoScroll';
export { useChatRuntimeSyncEffects } from './hooks/useChatRuntimeSyncEffects';
export { default as useScopedBusinessRequests } from './hooks/useScopedBusinessRequests';
export { useSocketConnectionAuthEffect } from './hooks/useSocketConnectionAuthEffect';
export { default as useSocketConnectionRuntimeEvents } from './hooks/useSocketConnectionRuntimeEvents';
export { default as useSocketBusinessDataEvents } from './hooks/useSocketBusinessDataEvents';
export { default as useSocketMessageLifecycleEvents } from './hooks/useSocketMessageLifecycleEvents';
export { default as useSocketAiAndSessionEvents } from './hooks/useSocketAiAndSessionEvents';
export { default as useChatPaginationRequester } from './hooks/useChatPaginationRequester';
export { default as useWaModuleSocketEvents } from './hooks/useWaModuleSocketEvents';
export { default as useWorkspaceNavigation } from './hooks/useWorkspaceNavigation';
export { default as useTransportSelectionActions } from './hooks/useTransportSelectionActions';
export { default as useChatMessageActions } from './hooks/useChatMessageActions';
export { default as useAttachmentActions } from './hooks/useAttachmentActions';
export { default as useChatSidebarActions } from './hooks/useChatSidebarActions';
export { default as useChatMessageUiActions } from './hooks/useChatMessageUiActions';
export { default as useChatSelectionAction } from './hooks/useChatSelectionAction';
export { default as useWorkspaceResetOnTenantChange } from './hooks/useWorkspaceResetOnTenantChange';
export { default as useAppDerivedChatState } from './hooks/useAppDerivedChatState';
export { default as useGlobalEscapeToCloseChat } from './hooks/useGlobalEscapeToCloseChat';

export { readWaLaunchParams } from './helpers/waLaunchParams';
export { normalizeQuickRepliesSocketPayload } from './helpers/quickRepliesSocket.helpers';
export { resolveScopedCatalogSelection } from './helpers/catalogScope.helpers';
export { requestAiSuggestionForChat } from './helpers/aiSuggestion.helpers';
export * from './helpers/appChat.helpers';
