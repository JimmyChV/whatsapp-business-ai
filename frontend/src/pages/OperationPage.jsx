import { useEffect, useRef, useState } from 'react';
import { Sidebar, BusinessSidebar, ClientProfilePanel, ChatWindow, NewChatModal } from '../features/chat/components';
import { sanitizeDisplayText } from '../features/chat/core';
import {
  CHAT_NOTIFICATION_OPEN_EVENT,
  CHAT_NOTIFICATION_OPEN_REQUEST_KEY,
  clearChatNotificationOpenRequest,
  readChatNotificationOpenRequest
} from '../features/chat/core/helpers/notificationWorkspace.helpers';

export default function OperationPage({
  forceOperationLaunch,
  socket,
  fileInputRef,
  handleFileChange,
  chats,
  chatsLoaded,
  activeChatId,
  handleChatSelect,
  myProfile,
  businessData,
  handleLogoutWhatsapp,
  handleRefreshChats,
  handleStartNewChat,
  labelDefinitions,
  handleCreateLabel,
  handleLoadMoreChats,
  chatsHasMore,
  isLoadingMoreChats,
  chatsTotal,
  chatSearchQuery,
  handleChatSearchChange,
  chatFilters,
  handleChatFiltersChange,
  handleOpenCompanyProfile,
  saasAuthEnabled,
  availableTenantOptions,
  tenantScopeId,
  tenantSwitchError,
  handleSaasLogout,
  canManageSaas,
  handleOpenSaasAdminWorkspace,
  availableWaModules,
  clientContact,
  messages,
  messagesEndRef,
  isDragOver,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  showClientProfile,
  setShowClientProfile,
  inputText,
  setInputText,
  handleSendMessage,
  handleSendCatalogProduct,
  handleSendReaction,
  handleRetryMessage,
  attachment,
  attachmentPreview,
  removeAttachment,
  isAiLoading,
  requestAiSuggestion,
  aiPrompt,
  setAiPrompt,
  isCopilotMode,
  setIsCopilotMode,
  handleToggleChatLabel,
  handleToggleChatPinned,
  handleEditMessage,
  waCapabilities,
  handleReplyMessage,
  handleForwardMessage,
  handleDeleteMessage,
  quickReplies,
  handleOpenSendTemplate,
  handleCloseSendTemplate,
  handleSelectTemplatePreview,
  handleConfirmSendTemplate,
  sendTemplateOpen,
  sendTemplateOptions,
  sendTemplateOptionsLoading,
  sendTemplateOptionsError,
  selectedSendTemplate,
  selectedSendTemplatePreview,
  selectedSendTemplatePreviewLoading,
  selectedSendTemplatePreviewError,
  sendTemplateSubmitting,
  chatAssignmentState,
  chatCommercialStatusState,
  handleSendQuickReply,
  quickReplyDraft,
  setQuickReplyDraft,
  handleLoadOrderToCart,
  handleCancelEditMessage,
  handleCancelReplyMessage,
  editingMessage,
  replyingMessage,
  buildApiHeaders,
  clientProfilePanelRef,
  toasts,
  setToasts,
  pendingOrderCartLoad,
  openCompanyProfileToken,
  selectedCatalogModuleId,
  activeCatalogId,
  selectedWaModule,
  handleSelectCatalogModule,
  handleSelectCatalog,
  handleUploadCatalogImage,
  handleCartSnapshotChange,
  newChatDialog,
  setNewChatDialog,
  newChatAvailableModules,
  handleSelectNewChatCustomerOption,
  handleConfirmNewChat,
  handleCancelNewChatDialog,
  showSaasAdminPanel,
  setShowSaasAdminPanel,
  handleOpenWhatsAppOperation,
  saasUserRole,
  saasSession,
  requestedWaTenantFromUrl,
  requestedLaunchSource,
  requestedWaSectionFromUrl,
  SaasPanelComponent,
}) {
  const [cartDraftsByChat, setCartDraftsByChat] = useState({});
  const originalDocumentTitleRef = useRef(typeof document !== 'undefined' ? document.title : 'WhatsApp Business Pro');
  const activeChatDetails = chats.find((c) => c.id === activeChatId) || null;
  const mergedActiveChatDetails = activeChatDetails || clientContact
    ? {
      ...(clientContact || {}),
      ...(activeChatDetails || {}),
      windowOpen: typeof activeChatDetails?.windowOpen === 'boolean'
        ? activeChatDetails.windowOpen
        : (typeof clientContact?.windowOpen === 'boolean' ? clientContact.windowOpen : true),
      windowExpiresAt: activeChatDetails?.windowExpiresAt || clientContact?.windowExpiresAt || null
    }
    : null;
  const forwardChatOptions = chats
    .filter((chat) => chat?.id && String(chat.id) !== String(activeChatId || ''))
    .map((chat) => ({
      id: chat.id,
      name: sanitizeDisplayText(chat?.name || '') || 'Contacto',
      phone: sanitizeDisplayText(chat?.phone || ''),
      subtitle: sanitizeDisplayText(chat?.subtitle || ''),
      timestamp: Number(chat?.timestamp || 0) || 0,
    }))
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  const appContainerClassName = forceOperationLaunch ? 'app-container app-container--operation' : 'app-container';

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const totalToastCount = (Array.isArray(toasts) ? toasts : []).reduce((acc, toast) => {
      return acc + Math.max(1, Number(toast?.count || 0));
    }, 0);
    const baseTitle = originalDocumentTitleRef.current || 'WhatsApp Business Pro';
    document.title = totalToastCount > 0 ? `(${totalToastCount}) ${baseTitle}` : baseTitle;
    return () => {
      document.title = baseTitle;
    };
  }, [toasts]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handlePendingChatOpen = (request = null) => {
      const pendingRequest = request && typeof request === 'object'
        ? request
        : readChatNotificationOpenRequest();
      const targetTenantId = String(pendingRequest?.tenantId || '').trim();
      const targetChatId = String(pendingRequest?.chatId || '').trim();
      if (!targetTenantId || !targetChatId) return;
      if (String(targetTenantId) !== String(tenantScopeId || '').trim()) return;

      handleChatSelect?.(targetChatId, { clearSearch: true });
      setToasts((prev) => (Array.isArray(prev) ? prev : []).filter((toast) => String(toast?.chatId || '') !== targetChatId));
      clearChatNotificationOpenRequest();
    };

    const handleStorage = (event) => {
      if (String(event?.key || '') !== CHAT_NOTIFICATION_OPEN_REQUEST_KEY) return;
      handlePendingChatOpen();
    };

    const handleCustomOpenEvent = (event) => {
      handlePendingChatOpen(event?.detail || null);
    };

    handlePendingChatOpen();
    window.addEventListener('storage', handleStorage);
    window.addEventListener(CHAT_NOTIFICATION_OPEN_EVENT, handleCustomOpenEvent);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(CHAT_NOTIFICATION_OPEN_EVENT, handleCustomOpenEvent);
    };
  }, [handleChatSelect, setToasts, tenantScopeId]);

  return (
    <div className={appContainerClassName}>
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileChange}
        accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
      />

      <Sidebar
        chats={chats}
        chatsLoaded={chatsLoaded}
        activeChatId={activeChatId}
        onChatSelect={handleChatSelect}
        myProfile={myProfile || businessData?.profile}
        onLogout={handleLogoutWhatsapp}
        onRefreshChats={handleRefreshChats}
        onStartNewChat={handleStartNewChat}
        labelDefinitions={labelDefinitions}
        onCreateLabel={handleCreateLabel}
        onLoadMoreChats={handleLoadMoreChats}
        chatsHasMore={chatsHasMore}
        chatsLoadingMore={isLoadingMoreChats}
        chatsTotal={chatsTotal}
        searchQuery={chatSearchQuery}
        onSearchQueryChange={handleChatSearchChange}
        activeFilters={chatFilters}
        onFiltersChange={handleChatFiltersChange}
        onOpenCompanyProfile={handleOpenCompanyProfile}
        buildApiHeaders={buildApiHeaders}
        saasAuthEnabled={saasAuthEnabled}
        tenantOptions={availableTenantOptions}
        activeTenantId={tenantScopeId}
        tenantSwitchError={tenantSwitchError}
        onSaasLogout={handleSaasLogout}
        canManageSaas={canManageSaas}
        onOpenSaasAdmin={() => handleOpenSaasAdminWorkspace({ tenantId: tenantScopeId })}
        waModules={availableWaModules}
        chatAssignmentState={chatAssignmentState}
        chatCommercialStatusState={chatCommercialStatusState}
        showBackToPanel={Boolean(forceOperationLaunch && canManageSaas)}
        onBackToPanel={() => handleOpenSaasAdminWorkspace({ tenantId: tenantScopeId })}
      />

      <div className="main-workspace">
        {activeChatId ? (
          <div className="conversation-pane-shell">
            <ChatWindow
              activeChatDetails={mergedActiveChatDetails}
              messages={messages}
              businessData={businessData}
              messagesEndRef={messagesEndRef}
              isDragOver={isDragOver}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              showClientProfile={showClientProfile}
              setShowClientProfile={setShowClientProfile}
              inputText={inputText}
              setInputText={setInputText}
              onSendMessage={handleSendMessage}
              onSendReaction={handleSendReaction}
              onRetryMessage={handleRetryMessage}
              onFileClick={() => fileInputRef.current?.click()}
              attachment={attachment}
              attachmentPreview={attachmentPreview}
              removeAttachment={removeAttachment}
              isAiLoading={isAiLoading}
              onRequestAiSuggestion={requestAiSuggestion}
              aiPrompt={aiPrompt}
              setAiPrompt={setAiPrompt}
              isCopilotMode={isCopilotMode}
              setIsCopilotMode={setIsCopilotMode}
              labelDefinitions={labelDefinitions}
              onToggleChatLabel={handleToggleChatLabel}
              onToggleChatPinned={handleToggleChatPinned}
              onEditMessage={handleEditMessage}
              onReplyMessage={waCapabilities.messageReply ? handleReplyMessage : null}
              onForwardMessage={waCapabilities.messageForward ? handleForwardMessage : null}
              onDeleteMessage={waCapabilities.messageDelete ? handleDeleteMessage : null}
              forwardChatOptions={forwardChatOptions}
              quickReplies={quickReplies}
              onOpenSendTemplate={handleOpenSendTemplate}
              onCloseSendTemplate={handleCloseSendTemplate}
              onSelectTemplatePreview={handleSelectTemplatePreview}
              onConfirmSendTemplate={handleConfirmSendTemplate}
              sendTemplateOpen={sendTemplateOpen}
              sendTemplateOptions={sendTemplateOptions}
              sendTemplateOptionsLoading={sendTemplateOptionsLoading}
              sendTemplateOptionsError={sendTemplateOptionsError}
              selectedSendTemplate={selectedSendTemplate}
              selectedSendTemplatePreview={selectedSendTemplatePreview}
              selectedSendTemplatePreviewLoading={selectedSendTemplatePreviewLoading}
              selectedSendTemplatePreviewError={selectedSendTemplatePreviewError}
              sendTemplateSubmitting={sendTemplateSubmitting}
              onSendQuickReply={handleSendQuickReply}
              quickReplyDraft={quickReplyDraft}
              onClearQuickReplyDraft={() => setQuickReplyDraft(null)}
              onLoadOrderToCart={handleLoadOrderToCart}
              onStartNewChat={handleStartNewChat}
              onCancelEditMessage={handleCancelEditMessage}
              onCancelReplyMessage={handleCancelReplyMessage}
              editingMessage={editingMessage}
              replyingMessage={replyingMessage}
              buildApiHeaders={buildApiHeaders}
              activeTenantId={tenantScopeId}
              currentUserRole={saasUserRole}
              canEditMessages={waCapabilities.messageEdit}
              waModules={availableWaModules}
              chatAssignmentState={chatAssignmentState}
              chatCommercialStatusState={chatCommercialStatusState}
            />

            {showClientProfile && (
              <ClientProfilePanel
                contact={{ ...activeChatDetails, ...clientContact }}
                chats={chats}
                onClose={() => setShowClientProfile(false)}
                onQuickAiAction={requestAiSuggestion}
                panelRef={clientProfilePanelRef}
              />
            )}
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#222e35',
            }}
          >
            <div className="conversation-empty-card">
              <div className="conversation-empty-icon">WA</div>
              <h1 className="conversation-empty-title">WhatsApp Business Pro</h1>
              <p className="conversation-empty-text">
                Selecciona un chat para comenzar a vender.<br />
                Usa los botones de IA para cerrar mas ventas con OpenAI.
              </p>
              <div className="conversation-empty-features">
                <strong>Funciones IA disponibles:</strong>
                <br />
                Sugerencia de respuesta automatica
                <br />
                Recomendacion de producto
                <br />
                Tecnicas de cierre de venta
                <br />
                Manejo de objeciones
              </div>
            </div>
          </div>
        )}

        {toasts.length > 0 && (
          <div className="in-app-toast-stack">
            {toasts.map((toast) => (
              <button
                key={toast.id}
                className="in-app-toast"
                onClick={() => {
                  handleChatSelect(toast.chatId, { clearSearch: true });
                  setToasts((prev) => prev.filter((t) => t.id !== toast.id));
                }}
              >
                <div className="in-app-toast-head">
                  <div className="in-app-toast-copy">
                    <strong title={toast.title || 'Nuevo mensaje'}>{toast.title || 'Nuevo mensaje'}</strong>
                    {toast.subtitle ? <small title={toast.subtitle}>{toast.subtitle}</small> : null}
                  </div>
                  {Number(toast.count || 0) > 1 ? (
                    <span className="in-app-toast-count">{toast.count}</span>
                  ) : null}
                </div>
                <span title={toast.body}>{toast.body}</span>
              </button>
            ))}
          </div>
        )}

        {activeChatId && (
          <BusinessSidebar
            tenantScopeKey={tenantScopeId}
            setInputText={setInputText}
            businessData={businessData}
            messages={messages}
            activeChatId={activeChatId}
            activeChatPhone={activeChatDetails?.phone || clientContact?.phone || ''}
            activeChatDetails={mergedActiveChatDetails}
            socket={socket}
            myProfile={myProfile || businessData?.profile}
            onLogout={handleLogoutWhatsapp}
            quickReplies={quickReplies}
            onSendQuickReply={handleSendQuickReply}
            onSendCatalogProduct={handleSendCatalogProduct}
            pendingOrderCartLoad={pendingOrderCartLoad}
            waCapabilities={waCapabilities}
            openCompanyProfileToken={openCompanyProfileToken}
            waModules={availableWaModules}
            selectedCatalogModuleId={selectedCatalogModuleId}
            selectedCatalogId={activeCatalogId}
            activeModuleId={String(activeChatDetails?.scopeModuleId || selectedWaModule?.moduleId || '').trim().toLowerCase()}
            onSelectCatalogModule={handleSelectCatalogModule}
            onSelectCatalog={handleSelectCatalog}
            onUploadCatalogImage={handleUploadCatalogImage}
            onCartSnapshotChange={handleCartSnapshotChange}
            cartDraftsByChat={cartDraftsByChat}
            setCartDraftsByChat={setCartDraftsByChat}
            chatAssignmentState={chatAssignmentState}
            chatCommercialStatusState={chatCommercialStatusState}
            buildApiHeaders={buildApiHeaders}
          />
        )}
      </div>

      <NewChatModal
        isOpen={newChatDialog.open}
        dialog={newChatDialog}
        availableModules={newChatAvailableModules}
        onChange={(patch) => setNewChatDialog((prev) => ({ ...prev, ...patch }))}
        onSelectCustomerOption={handleSelectNewChatCustomerOption}
        onConfirm={handleConfirmNewChat}
        onCancel={handleCancelNewChatDialog}
      />

      <SaasPanelComponent
        isOpen={showSaasAdminPanel}
        onClose={() => setShowSaasAdminPanel(false)}
        onLogout={handleSaasLogout}
        socket={socket}
        onOpenWhatsAppOperation={handleOpenWhatsAppOperation}
        buildApiHeaders={buildApiHeaders}
        activeTenantId={tenantScopeId}
        canManageSaas={canManageSaas}
        userRole={saasUserRole}
        isSuperAdmin={Boolean(saasSession?.user?.isSuperAdmin)}
        currentUser={saasSession?.user || null}
        preferredTenantId={requestedWaTenantFromUrl || ''}
        launchSource={requestedLaunchSource || ''}
        initialSection={requestedWaSectionFromUrl || 'saas_resumen'}
        resetKeys={[showSaasAdminPanel, tenantScopeId, saasSession?.user?.userId, requestedWaSectionFromUrl]}
      />
    </div>
  );
}


