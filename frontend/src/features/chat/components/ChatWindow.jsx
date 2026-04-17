import React from 'react';
import { Search, MoreVertical, ChevronUp, ChevronDown, Tag, MapPin, Share2, X } from 'lucide-react';
import MessageBubble from './message-bubble/MessageBubble';
import moment from 'moment';
import ChannelBrandIcon from './ChannelBrandIcon';
import ChatInput from './ChatInput';
import SendTemplateModal from './SendTemplateModal';
import AssignmentBadge from './assignment/AssignmentBadge';
import CommercialStatusBadge from './commercial/CommercialStatusBadge';
import CommercialStatusActions from './commercial/CommercialStatusActions';
import TakeChatButton from './assignment/TakeChatButton';
import AssignmentSelector from './assignment/AssignmentSelector';
import useChatWindowMapController from './hooks/useChatWindowMapController';
import useChatWindowSearchController from './hooks/useChatWindowSearchController';
import useChatWindowHeaderModel from './hooks/useChatWindowHeaderModel';
import useChatWindowUiToggles from './hooks/useChatWindowUiToggles';

// ============================================================
// ChatWindow - Full component with Profile Panel
// ============================================================
const ChatWindow = ({
    activeChatDetails,
    messages,
    messagesEndRef,
    isCopilotMode,
    setIsCopilotMode,
    isDragOver,
    onDragOver,
    onDragLeave,
    onDrop,
    showClientProfile,
    setShowClientProfile,
    labelDefinitions = [],
    onToggleChatLabel,
    onToggleChatPinned,
    onEditMessage,
    onReplyMessage,
    onForwardMessage,
    onDeleteMessage,
    forwardChatOptions = [],

    canEditMessages = false,
    buildApiHeaders,
    activeTenantId = '',
    currentUserRole = '',
    waModules = [],
    chatAssignmentState = null,
    chatCommercialStatusState = null,
    ...inputProps
}) => {
    const {
        showMenu,
        setShowMenu,
        showLabelMenu,
        setShowLabelMenu,
        lightboxMedia,
        setLightboxMedia,
        showMapModal,
        setShowMapModal
    } = useChatWindowUiToggles();
    const {
        mapQuery,
        setMapQuery,
        mapEmbedUrl,
        mapSuggestions,
        mapSuggestionsLoading,
        mapResolveLoading,
        selectedMapSuggestion,
        setSelectedMapSuggestion,
        selectMapSuggestion,
        openMapModal,
        submitMapSearch,
        mapExternalUrl,
        shareMapSelection,
        canShareLocation
    } = useChatWindowMapController({
        buildApiHeaders,
        onPrefillMessage: (text) => {
            if (typeof inputProps?.setInputText === 'function') {
                inputProps.setInputText(text);
            }
        },
        showMapModal,
        setShowMapModal
    });
    const {
        searchVisible,
        setSearchVisible,
        chatSearch,
        setChatSearch,
        activeMatchIdx,
        setActiveMatchIdx,
        messageRefs,
        matchIndexes,
        jumpToMatch
    } = useChatWindowSearchController({ messages });

    const {
        avatarColor,
        resolveGroupSenderName,
        formatDayLabel,
        headerDisplayName,
        showHeaderModule,
        headerModuleName,
        headerModuleChannel,
        headerModuleChannelType,
        headerModuleImageUrl,
        headerChannelMarker,
        headerAvatarImageUrl,
        headerAvatarFallback
    } = useChatWindowHeaderModel({
        activeChat: activeChatDetails,
        messages,
        waModules
    });
    const activeChatScopedId = String(activeChatDetails?.id || '').trim();
    const activeChatAssignment = typeof chatAssignmentState?.getAssignment === 'function'
        ? chatAssignmentState.getAssignment(activeChatScopedId)
        : null;
    const activeChatCommercialStatus = typeof chatCommercialStatusState?.getCommercialStatus === 'function'
        ? chatCommercialStatusState.getCommercialStatus(activeChatScopedId)
        : null;
    const isAssignedToMe = typeof chatAssignmentState?.isAssignedToMe === 'function'
        ? chatAssignmentState.isAssignedToMe(activeChatScopedId)
        : false;
    const hasAssignee = Boolean(String(activeChatAssignment?.assigneeUserId || '').trim());
    const canWriteByAssignment = hasAssignee && isAssignedToMe;
    const activeScopeModuleId = String(activeChatDetails?.scopeModuleId || activeChatAssignment?.scopeModuleId || '').trim().toLowerCase();
    const headerLabels = Array.isArray(activeChatDetails?.labels) ? activeChatDetails.labels : [];
    const visibleHeaderLabels = headerLabels.slice(0, 2);
    const hiddenHeaderLabelsCount = Math.max(0, headerLabels.length - visibleHeaderLabels.length);
    const handleJumpToMessage = (targetMessageId) => {
        const safeTargetMessageId = String(targetMessageId || '').trim();
        if (!safeTargetMessageId) return;
        const targetNode = messageRefs.current?.[safeTargetMessageId]
            || document.querySelector(`[data-message-id="${safeTargetMessageId}"]`);
        if (!targetNode || typeof targetNode.scrollIntoView !== 'function') return;
        targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    return (
        <div
            className={`chat-window drop-zone ${isDragOver ? 'drag-over' : ''}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
        >
            {/* Chat Header */}
            <div className="chat-header chat-header-pro" onClick={() => setShowClientProfile(v => !v)}>
                <div
                    className="chat-header-avatar chat-header-avatar--module"
                    style={{
                        background: headerAvatarImageUrl
                            ? `url(${headerAvatarImageUrl}) center/cover`
                            : avatarColor(headerModuleName || activeChatDetails?.name),
                    }}
                >
                    {!headerAvatarImageUrl && headerAvatarFallback}
                    <span
                        className={`chat-header-avatar-channel chat-header-avatar-channel--${headerChannelMarker.key}`}
                        title={headerChannelMarker.label}
                    >
                        <ChannelBrandIcon
                            channelType={headerChannelMarker.key}
                            className="chat-header-avatar-channel-icon"
                            size={10}
                            title={headerChannelMarker.label}
                        />
                    </span>
                </div>
                <div className="chat-header-meta">
                    <div className="chat-header-title-row chat-header-title-row--clean">
                        <h3 className="chat-header-name">{headerDisplayName}</h3>
                        <CommercialStatusBadge
                            commercialStatus={activeChatCommercialStatus}
                            compact
                        />
                        <AssignmentBadge
                            assignment={activeChatAssignment}
                            isAssignedToMe={isAssignedToMe}
                            compact
                        />
                        <CommercialStatusActions
                            chatId={activeChatScopedId}
                            commercialStatus={activeChatCommercialStatus}
                            chatCommercialStatusState={chatCommercialStatusState}
                            currentUserRole={currentUserRole}
                        />
                    </div>
                    <div className="chat-header-subline chat-header-subline--summary">
                        {showHeaderModule && (
                            <span className="chat-header-module-mini" title={headerModuleName || 'Modulo'}>
                                {headerModuleImageUrl
                                    ? <img src={headerModuleImageUrl} alt={headerModuleName || 'Modulo'} className="chat-header-module-avatar" />
                                    : <span className="chat-header-module-dot" aria-hidden="true" />}
                                <span className="chat-header-module-name">{headerModuleName || 'MODULO'}</span>
                                {headerModuleChannel && (
                                    <span className="chat-header-module-channel" title={headerModuleChannel}>
                                        <ChannelBrandIcon
                                            channelType={headerModuleChannelType}
                                            className="chat-header-module-channel-icon"
                                            size={10}
                                            title={headerModuleChannel}
                                        />
                                    </span>
                                )}
                            </span>
                        )}
                        {activeChatDetails?.isBusiness && <span className="chat-header-secondary-pill">Business</span>}
                        {visibleHeaderLabels.map((label, index) => (
                            <span
                                key={`${label?.id || label?.name || 'h'}_${index}`}
                                className="chat-header-label-chip chat-header-label-chip--compact"
                                style={{ '--label-color': label?.color || '#7a8f9a' }}
                                title={label?.name || 'Etiqueta'}
                            >
                                {label?.name || 'Etiqueta'}
                            </span>
                        ))}
                        {hiddenHeaderLabelsCount > 0 && (
                            <span className="chat-header-label-more" title={`${hiddenHeaderLabelsCount} etiqueta(s) adicionales`}>
                                +{hiddenHeaderLabelsCount}
                            </span>
                        )}
                    </div>
                </div>
                <div className="chat-header-actions" onClick={e => e.stopPropagation()}>
                    <button className={`btn-icon ui-icon-btn chat-header-action-btn ${searchVisible ? 'active' : ''}`}
                        onClick={() => setSearchVisible(v => !v)} title="Buscar en chat">
                        <Search size={20} />
                    </button>
                    <button className={`btn-icon ui-icon-btn chat-header-action-btn ${showMapModal ? 'active' : ''}`}
                        onClick={() => openMapModal({ query: '' })}
                        title="Abrir mapa">
                        <MapPin size={20} />
                    </button>
                    <div className="chat-header-menu-wrap">
                        <button className={`btn-icon ui-icon-btn chat-header-action-btn ${showLabelMenu ? 'active' : ''}`}
                            onClick={() => setShowLabelMenu(v => !v)} title="Etiquetas">
                            <Tag size={20} />
                        </button>
                        {showLabelMenu && (
                            <div className="chat-header-popover chat-header-label-popover">
                                <div className="chat-header-popover-title">Etiquetas del tenant (CRM)</div>
                                {labelDefinitions.length === 0 && <div className="chat-header-popover-empty">No hay etiquetas disponibles.</div>}
                                {labelDefinitions.map((label) => {
                                    const labelId = String(label?.id || label?.labelId || '').trim();
                                    const isActive = (activeChatDetails?.labels || []).some((l) => String(l?.id || l?.labelId || '').trim() === labelId);
                                    return (
                                        <label key={labelId || label.name} className="chat-header-label-option">
                                            <input type="checkbox" checked={isActive} onChange={() => onToggleChatLabel?.(activeChatDetails?.id, labelId)} />
                                            <span className="chat-header-label-color" style={{ background: label.color || '#8696a0' }} />
                                            <span className="chat-header-label-name">{label.name}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    <div className="chat-header-menu-wrap">
                        <button className="btn-icon ui-icon-btn chat-header-action-btn"
                            onClick={() => setShowMenu(v => !v)} title="Mas opciones">
                            <MoreVertical size={20} />
                        </button>
                        {showMenu && (
                            <div className="chat-header-popover chat-header-actions-popover">
                                {[
                                    { label: 'Ver perfil del contacto', action: () => setShowClientProfile(true) },
                                    { label: 'Buscar mensajes', action: () => setSearchVisible(true) },
                                    {
                                        label: activeChatDetails?.pinned ? 'Desfijar chat' : 'Fijar chat',
                                        action: () => onToggleChatPinned?.(activeChatDetails?.id, !Boolean(activeChatDetails?.pinned))
                                    },
                                    { label: 'Modo Copiloto IA', action: () => setIsCopilotMode(v => !v) },
                                ].map((item, i) => (
                                    <div key={i}
                                        onClick={() => { item.action(); setShowMenu(false); }}
                                        className="chat-header-action-item"
                                    >
                                        {item.label}
                                    </div>
                                ))}
                                <div className="chat-header-popover-divider" />
                                <div className="chat-header-popover-section">
                                    <AssignmentSelector
                                        activeTenantId={activeTenantId}
                                        chatId={activeChatScopedId}
                                        scopeModuleId={activeScopeModuleId}
                                        buildApiHeaders={buildApiHeaders}
                                        currentUserRole={currentUserRole}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {/* In-chat Search Bar */}
            {searchVisible && (
                <div className="chat-searchbar">
                    <Search size={16} color="#8696a0" />
                    <input
                        autoFocus
                        type="text"
                        placeholder="Buscar en esta conversacion..."
                        value={chatSearch}
                        onChange={e => setChatSearch(e.target.value)}
                        style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                    />
                    {matchIndexes.length > 0 && (
                        <span style={{ fontSize: '0.75rem', color: '#9db0ba' }}>{activeMatchIdx + 1}/{matchIndexes.length}</span>
                    )}
                    <button disabled={matchIndexes.length === 0} onClick={() => {
                        if (!matchIndexes.length) return;
                        const next = (activeMatchIdx - 1 + matchIndexes.length) % matchIndexes.length;
                        setActiveMatchIdx(next);
                        jumpToMatch(next);
                    }} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: matchIndexes.length ? 1 : 0.4 }}><ChevronUp size={16} color="#8696a0" /></button>
                    <button disabled={matchIndexes.length === 0} onClick={() => {
                        if (!matchIndexes.length) return;
                        const next = (activeMatchIdx + 1) % matchIndexes.length;
                        setActiveMatchIdx(next);
                        jumpToMatch(next);
                    }} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: matchIndexes.length ? 1 : 0.4 }}><ChevronDown size={16} color="#8696a0" /></button>
                    <button onClick={() => { setSearchVisible(false); setChatSearch(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                        <X size={16} color="#8696a0" />
                    </button>
                </div>
            )}

            {/* Messages Area */}
            <div className="chat-messages" onClick={() => { setShowMenu(false); setShowLabelMenu(false); }}>
                {/* TODO(bug): historial de chat muestra a veces solo el ultimo mensaje en lugar del historial completo — intermitente, causa desconocida */}
                {messages.length === 0 && (
                    <div className="chat-empty-state-pill">
                        No hay mensajes en esta conversacion.
                    </div>
                )}
                {messages.map((msg, idx) => {
                    const currentDay = moment.unix(msg.timestamp || 0).format('YYYY-MM-DD');
                    const prevDay = idx > 0 ? moment.unix(messages[idx - 1].timestamp || 0).format('YYYY-MM-DD') : null;
                    const showDay = idx === 0 || currentDay !== prevDay;
                    const matchIdx = matchIndexes.indexOf(idx);
                    const isHighlighted = matchIdx !== -1;
                    const isCurrentHighlighted = isHighlighted && matchIdx === activeMatchIdx;
                    const messageKey = msg.id || `idx_${idx}`;
                    const senderDisplayName = resolveGroupSenderName(msg);
                    return (
                        <React.Fragment key={messageKey}>
                            {showDay && (
                                <div className="chat-day-separator">
                                    {formatDayLabel(msg.timestamp)}
                                </div>
                            )}
                            <div
                                data-message-id={messageKey}
                                ref={(el) => {
                                    if (el) {
                                        messageRefs.current[messageKey] = el;
                                    } else {
                                        delete messageRefs.current[messageKey];
                                    }
                                }}
                            >
                                <MessageBubble
                                    msg={msg}
                                    isHighlighted={isHighlighted}
                                    isCurrentHighlighted={isCurrentHighlighted}
                                    onPrefillMessage={(text) => inputProps?.setInputText && inputProps.setInputText(text)}
                                    // TODO(bug): flujo de importacion al carrito desde cotizacion puede fallar — revisar cadena onLoadOrderToCart -> cart state
                                    onLoadOrderToCart={inputProps?.onLoadOrderToCart}
                                    onOpenMedia={setLightboxMedia}
                                    onOpenMap={openMapModal}
                                    onOpenPhoneChat={inputProps?.onStartNewChat}
                                    onEditMessage={onEditMessage}
                                    onReplyMessage={onReplyMessage}
                                    onForwardMessage={onForwardMessage}
                                    onJumpToMessage={handleJumpToMessage}
                                    onDeleteMessage={onDeleteMessage}
                                    forwardChatOptions={forwardChatOptions}
                                    activeChatId={activeChatDetails?.id}
                                    showSenderName={Boolean(activeChatDetails?.isGroup && !msg?.fromMe)}
                                    senderDisplayName={senderDisplayName}
                                    canEditMessages={canEditMessages}
                                    buildApiHeaders={buildApiHeaders}
                                />
                            </div>
                        </React.Fragment>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {lightboxMedia?.src && (
                <div className="chat-lightbox" onClick={() => setLightboxMedia(null)}>
                    <div className="chat-lightbox-content" onClick={(e) => e.stopPropagation()}>
                        <button className="chat-lightbox-close" onClick={() => setLightboxMedia(null)} aria-label="Cerrar vista previa">
                            <X size={20} />
                        </button>
                        <img src={lightboxMedia.src} alt="Vista previa" className="chat-lightbox-image" />
                    </div>
                </div>
            )}

            {showMapModal && (
                <div className="chat-lightbox" onClick={() => setShowMapModal(false)}>
                    <div className="chat-lightbox-content map-lightbox-content" onClick={(e) => e.stopPropagation()}>
                        <button className="chat-lightbox-close" onClick={() => setShowMapModal(false)} aria-label="Cerrar mapa">
                            <X size={20} />
                        </button>

                        <form className="map-search-form" onSubmit={submitMapSearch}>
                            <input
                                className="map-search-input"
                                placeholder="Busca una direccion o pega un link de mapa"
                                value={mapQuery}
                                onChange={(e) => {
                                    setMapQuery(e.target.value);
                                    setSelectedMapSuggestion(null);
                                }}
                            />
                            <button type="submit" className="map-search-btn" disabled={mapResolveLoading}>
                                {mapResolveLoading ? 'Resolviendo...' : 'Buscar'}
                            </button>
                            {mapExternalUrl && (
                                <a
                                    className="map-open-external"
                                    href={mapExternalUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    Abrir
                                </a>
                            )}
                            <button
                                type="button"
                                className="map-share-btn"
                                onClick={shareMapSelection}
                                disabled={!canShareLocation}
                                title="Copiar ubicacion al mensaje"
                            >
                                <Share2 size={14} /> Compartir
                            </button>
                        </form>

                        {(mapSuggestionsLoading || mapSuggestions.length > 0) && (
                            <div className="map-suggest-list">
                                {mapSuggestionsLoading && <div className="map-suggest-empty">Buscando lugares...</div>}
                                {!mapSuggestionsLoading && mapSuggestions.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        className={`map-suggest-item ${selectedMapSuggestion?.id === item.id ? 'active' : ''}`}
                                        onClick={() => selectMapSuggestion(item)}
                                    >
                                        <span className="map-suggest-title">{item.label}</span>
                                        {(item.latitude !== null && item.longitude !== null) && (
                                            <span className="map-suggest-coords">{item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}

                        {mapEmbedUrl ? (
                            <iframe
                                title="Mapa"
                                src={mapEmbedUrl}
                                className="map-lightbox-iframe"
                                loading="lazy"
                                referrerPolicy="no-referrer-when-downgrade"
                            />
                        ) : (
                            <div className="map-lightbox-empty">Busca y selecciona un lugar para previsualizarlo.</div>
                        )}
                    </div>
                </div>
            )}

            {/* Input Area */}
            {canWriteByAssignment ? (
                <>
                    <ChatInput
                        {...inputProps}
                        replyingMessage={inputProps?.replyingMessage}
                        onCancelReplyMessage={inputProps?.onCancelReplyMessage}
                        onOpenMapPicker={() => openMapModal({ query: '' })}
                        buildApiHeaders={buildApiHeaders}
                    />
                    <SendTemplateModal
                        isOpen={Boolean(inputProps?.sendTemplateOpen)}
                        templates={inputProps?.sendTemplateOptions}
                        templatesLoading={Boolean(inputProps?.sendTemplateOptionsLoading)}
                        templatesError={inputProps?.sendTemplateOptionsError}
                        selectedTemplate={inputProps?.selectedSendTemplate}
                        preview={inputProps?.selectedSendTemplatePreview}
                        previewLoading={Boolean(inputProps?.selectedSendTemplatePreviewLoading)}
                        previewError={inputProps?.selectedSendTemplatePreviewError}
                        confirmDisabled={!inputProps?.selectedSendTemplate || !inputProps?.selectedSendTemplatePreview || inputProps?.selectedSendTemplatePreviewLoading}
                        confirmBusy={Boolean(inputProps?.sendTemplateSubmitting)}
                        onClose={inputProps?.onCloseSendTemplate}
                        onSelectTemplate={inputProps?.onSelectTemplatePreview}
                        onConfirm={inputProps?.onConfirmSendTemplate}
                    />
                </>
            ) : (
                <div className="chat-assignment-lock">
                    <div className="chat-assignment-lock-meta">
                        <AssignmentBadge
                            assignment={activeChatAssignment}
                            isAssignedToMe={isAssignedToMe}
                        />
                        <span className="chat-assignment-lock-text">
                            Toma este chat para responder al cliente.
                        </span>
                    </div>
                    <TakeChatButton
                        chatId={activeChatScopedId}
                        scopeModuleId={activeScopeModuleId}
                        assignment={activeChatAssignment}
                        chatAssignmentState={chatAssignmentState}
                    />
                </div>
            )}
        </div>
    );
};

export { ChatInput };
export default ChatWindow;







