import React from 'react';
import { useEffect, useRef } from 'react';
import { Search, MoreVertical, ChevronUp, ChevronDown, Tag, MapPin, Share2, X } from 'lucide-react';
import MessageBubble from './message-bubble/MessageBubble';
import LocationMapDetails from './LocationMapDetails';
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

const CHAT_ORIGIN_RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const ORIGIN_ICON_MAP = {
    meta_ad: '📢',
    campaign: '📣',
    instagram_bio: '📱',
    google_business: '🔍',
    ai_referral: '🤖',
    tiktok: '🎵',
    youtube: '▶️',
    facebook_organic: '👥',
    qr_product: '📦',
    qr_store: '🏪',
    referral: '🤝',
    saved_contact: '📋'
};

const toChatOriginTimestampMs = (value = null) => {
    if (value === null || value === undefined || value === '') return 0;
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
        return numeric < 1000000000000 ? numeric * 1000 : numeric;
    }
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
};

const shouldFetchOriginForChat = (chat = null, messages = []) => {
    if (!chat) return false;
    if (chat?.adOrigin && typeof chat.adOrigin === 'object') return true;
    const timestamps = [
        chat?.createdAt,
        chat?.created_at,
        chat?.timestamp,
        Array.isArray(messages) && messages[0]?.timestamp
    ].map(toChatOriginTimestampMs).filter((value) => value > 0);
    if (timestamps.length === 0) return false;
    return (Date.now() - Math.max(...timestamps)) <= CHAT_ORIGIN_RECENT_WINDOW_MS;
};

const buildChatOriginCacheKey = (chatId = '', scopeModuleId = '') => {
    const safeChatId = String(chatId || '').trim();
    const safeScopeModuleId = String(scopeModuleId || '').trim().toLowerCase();
    return `${safeChatId}::${safeScopeModuleId}`;
};

const getChatOriginState = (chat = null) => {
    if (!chat || typeof chat !== 'object') return { hasValue: false, origin: null };
    if (Object.prototype.hasOwnProperty.call(chat, 'origin')) {
        return {
            hasValue: true,
            origin: chat.origin && typeof chat.origin === 'object' ? chat.origin : null
        };
    }
    if (Object.prototype.hasOwnProperty.call(chat, 'chatOrigin')) {
        return {
            hasValue: true,
            origin: chat.chatOrigin && typeof chat.chatOrigin === 'object' ? chat.chatOrigin : null
        };
    }
    return { hasValue: false, origin: null };
};

const normalizeForwardSearchText = (value = '') => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const normalizeOriginButtons = (buttons = []) => (
    Array.isArray(buttons)
        ? buttons.map((button) => {
            if (!button || typeof button !== 'object') return null;
            const label = String(button.label || button.title || button.text || '').trim();
            return label ? { label } : null;
        }).filter(Boolean)
        : []
);

const formatOriginDate = (value = '') => {
    const parsed = moment(value);
    return parsed.isValid() ? parsed.format('DD/MM/YYYY HH:mm') : '';
};

const getMetaOriginGreetingText = (origin = null) => {
    if (!origin || typeof origin !== 'object') return '';
    const source = String(origin.originSource || origin.origin_source || origin.originType || origin.origin_type || '').trim();
    if (source !== 'meta_ad') return '';
    return String(origin.greetingText || origin.greeting_text || origin.autofillMessage || origin.autofill_message || '').trim();
};

const MetaGreetingBubble = ({ greeting = '', buttons = [] }) => {
    const safeGreeting = String(greeting || '').trim();
    if (!safeGreeting) return null;
    const safeButtons = normalizeOriginButtons(buttons);

    return (
        <div className="message out meta-greeting-bubble">
            <div className="meta-greeting-text">{safeGreeting}</div>
            {safeButtons.length > 0 && (
                <div className="meta-greeting-chips">
                    {safeButtons.map((button, index) => <span key={`${button.label}_${index}`}>{button.label}</span>)}
                </div>
            )}
            <div className="meta-greeting-footer">🤖 Enviado automáticamente por Meta</div>
        </div>
    );
};

const ConversationOriginBlock = ({ origin = null }) => {
    if (!origin || typeof origin !== 'object') return null;
    const source = String(origin.originSource || origin.origin_source || origin.originType || origin.origin_type || '').trim();
    if (!source || source === 'organic') return null;

    const icon = ORIGIN_ICON_MAP[source] || '💬';
    const originLabel = String(origin.originLabel || origin.origin_label || '').trim();
    const originDetail = origin.originDetail && typeof origin.originDetail === 'object' ? origin.originDetail : {};
    if (source === 'meta_ad') {
        const campaignName = String(origin.campaignName || origin.campaign_name || origin.campaignId || origin.campaign_id || '').trim();
        const adsetName = String(origin.adsetName || origin.adset_name || origin.adsetId || origin.adset_id || '').trim();
        const adName = String(origin.adName || origin.ad_name || origin.referralHeadline || origin.referral_headline || originLabel || '').trim();
        const referralSourceUrl = String(origin.referralSourceUrl || origin.referral_source_url || origin.sourceUrl || '').trim();
        return (
            <div className="chat-origin-card chat-origin-card--meta">
                <div className="chat-origin-card-title"><span aria-hidden="true">{icon}</span><span>Cliente desde anuncio Meta</span></div>
                <div className="chat-origin-grid">
                    {campaignName && <><span>Campana</span><strong>{campaignName}</strong></>}
                    {adsetName && <><span>Conjunto</span><strong>{adsetName}</strong></>}
                    {adName && <><span>Anuncio</span><strong>{adName}</strong></>}
                </div>
                {referralSourceUrl && (
                    <button
                        type="button"
                        className="chat-origin-action-btn"
                        title="Ver el anuncio en Facebook/Instagram"
                        onClick={() => window.open(referralSourceUrl, '_blank')}
                    >
                        🎬 Ver anuncio →
                    </button>
                )}
            </div>
        );
    }

    if (source === 'campaign') {
        const sentAt = formatOriginDate(originDetail.sent_at || originDetail.sentAt);
        return (
            <div className="chat-origin-card chat-origin-card--campaign">
                <div className="chat-origin-card-title"><span aria-hidden="true">{icon}</span><span>Cliente desde campana</span></div>
                <div className="chat-origin-grid">
                    <span>Campana</span><strong>{originLabel || String(originDetail.campaign_name || '').trim() || 'Campana'}</strong>
                    {sentAt && <><span>Enviada</span><strong>{sentAt}</strong></>}
                </div>
                <div className="chat-origin-note">Respondio a una campana enviada en los ultimos 30 dias.</div>
            </div>
        );
    }

    return (
        <div className="chat-origin-card">
            <div className="chat-origin-card-title"><span aria-hidden="true">{icon}</span><span>{originLabel || 'Origen detectado'}</span></div>
            <div className="chat-origin-note">Origen detectado por el primer mensaje del cliente.</div>
        </div>
    );
};

const normalizePattyMode = (value = '') => {
    const mode = String(value || '').trim().toLowerCase();
    return ['autonomous', 'review', 'off'].includes(mode) ? mode : '';
};

const resolveModulePattyMode = (moduleConfig = null) => {
    const aiConfig = moduleConfig?.metadata?.aiConfig || moduleConfig?.aiConfig || {};
    const explicitMode = normalizePattyMode(aiConfig.effectiveMode || aiConfig.currentMode || aiConfig.mode);
    if (explicitMode) return explicitMode;
    const withinMode = normalizePattyMode(aiConfig.withinHoursMode || aiConfig.within_hours_mode);
    const outsideMode = normalizePattyMode(aiConfig.outsideHoursMode || aiConfig.outside_hours_mode);
    if (withinMode && withinMode === outsideMode) return withinMode;
    return outsideMode || withinMode || 'off';
};

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
    onSendReaction,
    onRetryMessage,
    onDeleteMessage,
    forwardChatOptions = [],

    canEditMessages = false,
    buildApiHeaders,
    activeTenantId = '',
    currentUserRole = '',
    businessData = {},
    waModules = [],
    chatAssignmentState = null,
    chatCommercialStatusState = null,
    onMobileBack = null,
    onMobileOpenTools = null,
    ...inputProps
}) => {
    const {
        showMenu,
        setShowMenu,
        showLabelMenu,
        setShowLabelMenu,
        showMobileShortcuts,
        setShowMobileShortcuts,
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
        mapModalMode,
        mapLocationPayload,
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
        headerPhone,
        headerAlias,
        headerLocation,
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
    const [forwardMode, setForwardMode] = React.useState(false);
    const [forwardStep, setForwardStep] = React.useState('messages');
    const [forwardSelectedMessageIds, setForwardSelectedMessageIds] = React.useState([]);
    const [forwardSelectedChatIds, setForwardSelectedChatIds] = React.useState([]);
    const [forwardSearch, setForwardSearch] = React.useState('');
    const forwardSelectedMessageSet = React.useMemo(
        () => new Set(forwardSelectedMessageIds.map((id) => String(id || '').trim()).filter(Boolean)),
        [forwardSelectedMessageIds]
    );
    const forwardSelectedChatSet = React.useMemo(
        () => new Set(forwardSelectedChatIds.map((id) => String(id || '').trim()).filter(Boolean)),
        [forwardSelectedChatIds]
    );
    const forwardNeedle = normalizeForwardSearchText(forwardSearch);
    const forwardCandidates = React.useMemo(() => (
        (Array.isArray(forwardChatOptions) ? forwardChatOptions : [])
            .filter((chat) => {
                const id = String(chat?.id || '').trim();
                if (!id || id === activeChatScopedId) return false;
                if (!forwardNeedle) return true;
                const haystack = normalizeForwardSearchText(`${chat?.name || ''} ${chat?.phone || ''} ${chat?.subtitle || ''}`);
                return haystack.includes(forwardNeedle);
            })
            .slice(0, 60)
    ), [activeChatScopedId, forwardChatOptions, forwardNeedle]);
    const forwardVisibleCandidates = React.useMemo(
        () => forwardCandidates.slice(0, forwardNeedle ? 60 : 10),
        [forwardCandidates, forwardNeedle]
    );
    const canForwardMessages = typeof onForwardMessage === 'function';
    const cancelForwardMode = React.useCallback(() => {
        setForwardMode(false);
        setForwardStep('messages');
        setForwardSelectedMessageIds([]);
        setForwardSelectedChatIds([]);
        setForwardSearch('');
    }, []);
    const startForwardMode = React.useCallback((message = null) => {
        const messageId = String(message?.id || '').trim();
        if (!messageId || !canForwardMessages) return;
        setForwardMode(true);
        setForwardStep('messages');
        setForwardSelectedMessageIds([messageId]);
        setForwardSelectedChatIds([]);
        setForwardSearch('');
    }, [canForwardMessages]);
    const toggleForwardMessage = React.useCallback((message = null) => {
        const messageId = String(message?.id || '').trim();
        if (!messageId) return;
        setForwardSelectedMessageIds((prev) => {
            const current = new Set(prev.map((id) => String(id || '').trim()).filter(Boolean));
            if (current.has(messageId)) current.delete(messageId);
            else current.add(messageId);
            return Array.from(current);
        });
    }, []);
    const openForwardTargets = React.useCallback(() => {
        if (!forwardMode || forwardSelectedMessageIds.length === 0) return;
        setForwardStep('targets');
        setForwardSelectedChatIds([]);
        setForwardSearch('');
    }, [forwardMode, forwardSelectedMessageIds.length]);
    const toggleForwardTarget = React.useCallback((chatId = '') => {
        const safeChatId = String(chatId || '').trim();
        if (!safeChatId) return;
        setForwardSelectedChatIds((prev) => {
            const current = new Set(prev.map((id) => String(id || '').trim()).filter(Boolean));
            if (current.has(safeChatId)) current.delete(safeChatId);
            else current.add(safeChatId);
            return Array.from(current);
        });
    }, []);
    const submitForwardMessages = React.useCallback(() => {
        const messageIds = forwardSelectedMessageIds.map((id) => String(id || '').trim()).filter(Boolean);
        const targetChatIds = forwardSelectedChatIds.map((id) => String(id || '').trim()).filter(Boolean);
        if (!canForwardMessages || messageIds.length === 0 || targetChatIds.length === 0) return;
        onForwardMessage(messageIds, targetChatIds);
        cancelForwardMode();
    }, [canForwardMessages, cancelForwardMode, forwardSelectedChatIds, forwardSelectedMessageIds, onForwardMessage]);
    useEffect(() => {
        cancelForwardMode();
    }, [activeChatScopedId, cancelForwardMode]);
    useEffect(() => {
        if (forwardMode && forwardSelectedMessageIds.length === 0) {
            setForwardMode(false);
            setForwardStep('messages');
        }
    }, [forwardMode, forwardSelectedMessageIds.length]);
    const activeChatAssignment = typeof chatAssignmentState?.getAssignment === 'function'
        ? chatAssignmentState.getAssignment(activeChatScopedId)
        : null;
    const activeChatCommercialStatus = typeof chatCommercialStatusState?.getCommercialStatus === 'function'
        ? chatCommercialStatusState.getCommercialStatus(activeChatScopedId)
        : null;
    const isAssignedToMe = typeof chatAssignmentState?.isAssignedToMe === 'function'
        ? chatAssignmentState.isAssignedToMe(activeChatScopedId)
        : false;
    const activeScopeModuleId = String(activeChatDetails?.scopeModuleId || activeChatAssignment?.scopeModuleId || '').trim().toLowerCase();
    const activeModuleConfig = React.useMemo(() => {
        const moduleId = String(activeScopeModuleId || '').trim().toLowerCase();
        const moduleName = String(headerModuleName || activeChatDetails?.moduleName || '').trim().toLowerCase();
        return (Array.isArray(waModules) ? waModules : []).find((entry) => {
            const entryId = String(entry?.moduleId || entry?.id || '').trim().toLowerCase();
            const entryName = String(entry?.name || '').trim().toLowerCase();
            return (moduleId && entryId === moduleId) || (moduleName && entryName === moduleName);
        }) || null;
    }, [activeChatDetails?.moduleName, activeScopeModuleId, headerModuleName, waModules]);
    const hasAssignee = Boolean(String(activeChatAssignment?.assigneeUserId || '').trim())
        && String(activeChatAssignment?.status || '').trim().toLowerCase() !== 'released';
    const canWriteByAssignment = hasAssignee && isAssignedToMe;
    const showPattyAssignee = !hasAssignee
        && !activeChatCommercialStatus?.needsAdvisor
        && resolveModulePattyMode(activeModuleConfig) === 'autonomous';
    const headerLabels = Array.isArray(activeChatDetails?.labels) ? activeChatDetails.labels : [];
    const visibleHeaderLabels = headerLabels.slice(0, 3);
    const hiddenHeaderLabelsCount = Math.max(0, headerLabels.length - visibleHeaderLabels.length);
    const activeAdOrigin = activeChatDetails?.adOrigin && typeof activeChatDetails.adOrigin === 'object'
        ? activeChatDetails.adOrigin
        : null;
    const activeAdOriginName = String(activeAdOrigin?.adName || '').trim();
    const [chatOrigin, setChatOrigin] = React.useState(null);
    const chatOriginCacheRef = useRef({});
    const metaGreetingText = getMetaOriginGreetingText(chatOrigin);
    const metaGreetingButtons = normalizeOriginButtons(chatOrigin?.buttonsJson || chatOrigin?.buttons_json || chatOrigin?.buttons);
    const mobileHeaderSubtitle = [headerLocation, headerPhone]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(' · ');
    const conversationWindowOpen = activeChatDetails?.windowOpen !== false;
    const pendingJumpMessageIdRef = useRef('');
    const chatHeaderRef = useRef(null);
    const chatHeaderToolbarRef = useRef(null);

    const handleJumpToMessage = (targetMessageId, attempt = 0) => {
        const safeTargetMessageId = String(targetMessageId || '').trim();
        if (!safeTargetMessageId) return;
        const targetNode = messageRefs.current?.[safeTargetMessageId]
            || document.querySelector(`[data-message-id="${safeTargetMessageId}"]`);
        if (!targetNode || typeof targetNode.scrollIntoView !== 'function') {
            pendingJumpMessageIdRef.current = safeTargetMessageId;
            if (attempt < 8) {
                window.setTimeout(() => handleJumpToMessage(safeTargetMessageId, attempt + 1), 90);
            }
            return;
        }
        pendingJumpMessageIdRef.current = '';
        targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    useEffect(() => {
        const pendingId = String(pendingJumpMessageIdRef.current || '').trim();
        if (!pendingId) return;
        const targetNode = messageRefs.current?.[pendingId]
            || document.querySelector(`[data-message-id="${pendingId}"]`);
        if (!targetNode || typeof targetNode.scrollIntoView !== 'function') return;
        pendingJumpMessageIdRef.current = '';
        targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [messages]);

    useEffect(() => {
        const baseChatId = String(activeChatDetails?.baseChatId || activeChatDetails?.id || '').trim();
        const scopeForOrigin = String(activeChatDetails?.scopeModuleId || activeScopeModuleId || '').trim();
        const cacheKey = buildChatOriginCacheKey(baseChatId, scopeForOrigin);
        const embeddedOrigin = getChatOriginState(activeChatDetails);
        if (embeddedOrigin.hasValue) {
            chatOriginCacheRef.current[cacheKey] = embeddedOrigin.origin || null;
            setChatOrigin(embeddedOrigin.origin || null);
            return undefined;
        }
        if (Object.prototype.hasOwnProperty.call(chatOriginCacheRef.current, cacheKey)) {
            setChatOrigin(chatOriginCacheRef.current[cacheKey] || null);
            return undefined;
        }
        if (!baseChatId || !shouldFetchOriginForChat(activeChatDetails, messages)) {
            setChatOrigin(null);
            return undefined;
        }

        const controller = new AbortController();
        const query = new URLSearchParams();
        if (scopeForOrigin) query.set('scopeModuleId', scopeForOrigin);
        fetch(`/api/tenant/chats/${encodeURIComponent(baseChatId)}/origin?${query.toString()}`, {
            method: 'GET',
            headers: typeof buildApiHeaders === 'function' ? buildApiHeaders() : undefined,
            signal: controller.signal
        })
            .then((response) => (response.ok ? response.json() : null))
            .then((payload) => {
                if (!payload?.ok) {
                    chatOriginCacheRef.current[cacheKey] = null;
                    setChatOrigin(null);
                    return;
                }
                const nextOrigin = payload.origin || null;
                chatOriginCacheRef.current[cacheKey] = nextOrigin;
                setChatOrigin(nextOrigin);
            })
            .catch((error) => {
                if (error?.name !== 'AbortError') {
                    chatOriginCacheRef.current[cacheKey] = null;
                    setChatOrigin(null);
                }
            });

        return () => controller.abort();
    }, [activeChatDetails, activeScopeModuleId, buildApiHeaders, messages]);

    useEffect(() => {
        const handlePointerDown = (event) => {
            if (chatHeaderRef.current?.contains(event.target)) return;
            if (chatHeaderToolbarRef.current?.contains(event.target)) return;
            setShowMenu(false);
            setShowLabelMenu(false);
            setShowMobileShortcuts(false);
        };

        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [setShowLabelMenu, setShowMenu, setShowMobileShortcuts]);

    return (
        <div
            className={`chat-window drop-zone ${isDragOver ? 'drag-over' : ''}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
        >
            {/* Chat Header */}
            <div className="chat-header chat-header-pro" onClick={() => setShowClientProfile(v => !v)} ref={chatHeaderRef}>
                <button
                    type="button"
                    className="chat-mobile-nav-btn chat-mobile-back-btn"
                    onClick={(event) => {
                        event.stopPropagation();
                        onMobileBack?.();
                    }}
                    aria-label="Volver a la lista de chats"
                    title="Volver"
                >
                    ←
                </button>
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
                        <h3 className="chat-header-name" title={headerDisplayName}>{headerDisplayName}</h3>
                    </div>
                    {mobileHeaderSubtitle && !activeChatDetails?.isGroup ? (
                        <div className="chat-header-subtitle" title={mobileHeaderSubtitle}>{mobileHeaderSubtitle}</div>
                    ) : null}
                    {false && activeAdOrigin && (
                        <span
                            className="chat-ad-origin-badge"
                            title={activeAdOriginName || 'Anuncio Meta'}
                        >
                            <span aria-hidden="true">📢</span>
                            <span>{activeAdOriginName || 'Anuncio Meta'}</span>
                        </span>
                    )}
                    <div className="chat-header-info-row">
                        {headerLocation && (
                            <span className="chat-header-location-chip" title={headerLocation}>
                                {headerLocation}
                            </span>
                        )}
                        {activeChatDetails?.isBusiness && <span className="chat-header-secondary-pill">Business</span>}
                        <CommercialStatusBadge
                            commercialStatus={activeChatCommercialStatus}
                            compact
                        />
                        <AssignmentBadge
                            assignment={activeChatAssignment}
                            isAssignedToMe={isAssignedToMe}
                            needsAdvisor={Boolean(activeChatCommercialStatus?.needsAdvisor)}
                            needsAdvisorReason={activeChatCommercialStatus?.needsAdvisorReason || ''}
                            virtualAssigneeLabel={showPattyAssignee ? 'Patty IA' : ''}
                            compact
                        />
                        {activeChatCommercialStatus?.needsAdvisor && (
                            <TakeChatButton
                                chatId={activeChatScopedId}
                                scopeModuleId={activeScopeModuleId}
                                assignment={activeChatAssignment}
                                chatAssignmentState={chatAssignmentState}
                                className="take-chat-button--header"
                            />
                        )}
                    </div>
                    {(visibleHeaderLabels.length > 0 || hiddenHeaderLabelsCount > 0) && (
                        <div className="chat-header-labels-row">
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
                    )}
                </div>
                <div className="chat-header-actions" onClick={e => e.stopPropagation()}>
                    <div className="chat-header-actions-top">
                        <CommercialStatusActions
                            chatId={activeChatScopedId}
                            commercialStatus={activeChatCommercialStatus}
                            chatCommercialStatusState={chatCommercialStatusState}
                            currentUserRole={currentUserRole}
                        />
                    </div>
                    <div className="chat-header-actions-row">
                        <button
                            type="button"
                            className="chat-mobile-nav-btn chat-mobile-tools-btn"
                            onClick={() => onMobileOpenTools?.()}
                            title="Abrir herramientas"
                        >
                            Herramientas
                        </button>
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
            </div>
            <div
                className={`chat-header-mobile-toolbar ${showMobileShortcuts ? 'is-open' : ''}`}
                onClick={e => e.stopPropagation()}
                ref={chatHeaderToolbarRef}
            >
                {!showMobileShortcuts && (
                    <button
                        type="button"
                        className="chat-header-mobile-utility-handle"
                        onClick={() => setShowMobileShortcuts(true)}
                        aria-expanded={showMobileShortcuts}
                        title="Mostrar opciones del chat"
                    >
                        <span>Mas</span>
                        <ChevronDown size={14} />
                    </button>
                )}
                {showMobileShortcuts && (
                    <div className="chat-header-mobile-utility-panel">
                        <div className="chat-header-mobile-labels">
                            <div className="chat-header-menu-wrap chat-header-menu-wrap--mobile">
                                <button
                                    className={`btn-icon ui-icon-btn chat-header-action-btn ${showLabelMenu ? 'active' : ''}`}
                                    onClick={() => setShowLabelMenu(v => !v)}
                                    title="Etiquetas"
                                >
                                    <Tag size={18} />
                                </button>
                                {showLabelMenu && (
                                    <div className="chat-header-popover chat-header-label-popover">
                                        <div className="chat-header-popover-title">Etiquetas del tenant (CRM)</div>
                                        {labelDefinitions.length === 0 && <div className="chat-header-popover-empty">No hay etiquetas disponibles.</div>}
                                        {labelDefinitions.map((label) => {
                                            const labelId = String(label?.id || label?.labelId || '').trim();
                                            const isActive = (activeChatDetails?.labels || []).some((l) => String(l?.id || l?.labelId || '').trim() === labelId);
                                            return (
                                                <label key={`mobile_${labelId || label.name}`} className="chat-header-label-option">
                                                    <input type="checkbox" checked={isActive} onChange={() => onToggleChatLabel?.(activeChatDetails?.id, labelId)} />
                                                    <span className="chat-header-label-color" style={{ background: label.color || '#8696a0' }} />
                                                    <span className="chat-header-label-name">{label.name}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                            {(visibleHeaderLabels.length > 0 || hiddenHeaderLabelsCount > 0) && (
                                <div className="chat-header-mobile-label-badges">
                                    {visibleHeaderLabels.map((label, index) => (
                                        <span
                                            key={`mobile_badge_${label?.id || label?.name || 'h'}_${index}`}
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
                            )}
                        </div>
                        <div className="chat-header-mobile-tools">
                            <button
                                type="button"
                                className="chat-mobile-nav-btn chat-mobile-tools-btn"
                                onClick={() => {
                                    setShowMobileShortcuts(false);
                                    onMobileOpenTools?.();
                                }}
                                title="Abrir herramientas"
                            >
                                Herramientas
                            </button>
                            <button
                                className={`btn-icon ui-icon-btn chat-header-action-btn ${searchVisible ? 'active' : ''}`}
                                onClick={() => {
                                    setSearchVisible(v => !v);
                                    setShowMobileShortcuts(false);
                                }}
                                title="Buscar en chat"
                            >
                                <Search size={18} />
                            </button>
                            <button
                                className={`btn-icon ui-icon-btn chat-header-action-btn ${showMapModal ? 'active' : ''}`}
                                onClick={() => {
                                    openMapModal({ query: '' });
                                    setShowMobileShortcuts(false);
                                }}
                                title="Abrir mapa"
                            >
                                <MapPin size={18} />
                            </button>
                        </div>
                    </div>
                )}
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
            <div className="chat-messages" onClick={() => { setShowMenu(false); setShowLabelMenu(false); setShowMobileShortcuts(false); }}>
                {/* TODO(bug): historial de chat muestra a veces solo el ultimo mensaje en lugar del historial completo — intermitente, causa desconocida */}
                {messages.length === 0 && (
                    <div className="chat-empty-state-pill">
                        No hay mensajes en esta conversacion.
                    </div>
                )}
                <ConversationOriginBlock origin={chatOrigin} />
                {messages.map((msg, idx) => {
                    const currentDay = moment.unix(msg.timestamp || 0).format('YYYY-MM-DD');
                    const prevDay = idx > 0 ? moment.unix(messages[idx - 1].timestamp || 0).format('YYYY-MM-DD') : null;
                    const showDay = idx === 0 || currentDay !== prevDay;
                    const matchIdx = matchIndexes.indexOf(idx);
                    const isHighlighted = matchIdx !== -1;
                    const isCurrentHighlighted = isHighlighted && matchIdx === activeMatchIdx;
                    const messageKey = msg.id || `idx_${idx}`;
                    const messageRenderKey = msg.clientTempId || msg.id || `idx_${idx}`;
                    const senderDisplayName = resolveGroupSenderName(msg);
                    const previousMessages = messages.slice(0, idx);
                    const isFirstInbound = msg?.fromMe === false && previousMessages.every((entry) => entry?.fromMe !== false);
                    return (
                        <React.Fragment key={messageRenderKey}>
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
                                    onCreateOrderFromCatalog={inputProps?.onCreateOrderFromCatalog}
                                    onOpenCatalogPanel={inputProps?.onOpenCatalogPanel}
                                    onOpenMedia={setLightboxMedia}
                                    onOpenMap={openMapModal}
                                    onOpenPhoneChat={inputProps?.onStartNewChat}
                                    onEditMessage={onEditMessage}
                                    onReplyMessage={onReplyMessage}
                                    onStartForwardMode={startForwardMode}
                                    onToggleForwardMessage={toggleForwardMessage}
                                    onSendReaction={onSendReaction}
                                    onRetryMessage={onRetryMessage}
                                    onJumpToMessage={handleJumpToMessage}
                                    onDeleteMessage={onDeleteMessage}
                                    activeChatId={activeChatDetails?.id}
                                    forwardMode={forwardMode}
                                    isForwardSelected={forwardSelectedMessageSet.has(String(msg?.id || '').trim())}
                                    catalog={businessData?.catalog || []}
                                    showSenderName={Boolean(activeChatDetails?.isGroup && !msg?.fromMe)}
                                    senderDisplayName={senderDisplayName}
                                    canEditMessages={canEditMessages}
                                    buildApiHeaders={buildApiHeaders}
                                />
                            </div>
                            {isFirstInbound && metaGreetingText && (
                                <MetaGreetingBubble
                                    greeting={metaGreetingText}
                                    buttons={metaGreetingButtons}
                                />
                            )}
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
                    <div className={`chat-lightbox-content map-lightbox-content ${mapModalMode === 'location' ? 'map-lightbox-content--location' : ''}`} onClick={(e) => e.stopPropagation()}>
                        {mapModalMode !== 'location' && (
                            <button className="chat-lightbox-close" onClick={() => setShowMapModal(false)} aria-label="Cerrar mapa">
                                <X size={20} />
                            </button>
                        )}

                        {mapModalMode === 'location' && mapLocationPayload ? (
                            <LocationMapDetails
                                location={mapLocationPayload}
                                buildApiHeaders={buildApiHeaders}
                                activeTenantId={activeTenantId}
                                activeChatId={activeChatScopedId}
                                onClose={() => setShowMapModal(false)}
                            />
                        ) : (
                            <>
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
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Input Area */}
            {forwardMode && forwardStep === 'messages' && (
                <div className="chat-forward-selection-bar">
                    <div className="chat-forward-selection-bar__copy">
                        <strong>Reenviar</strong>
                        <span>{forwardSelectedMessageIds.length} mensaje{forwardSelectedMessageIds.length === 1 ? '' : 's'} seleccionado{forwardSelectedMessageIds.length === 1 ? '' : 's'}</span>
                    </div>
                    <div className="chat-forward-selection-bar__actions">
                        <button type="button" className="chat-forward-selection-bar__cancel" onClick={cancelForwardMode}>
                            Cancelar
                        </button>
                        <button
                            type="button"
                            className="chat-forward-selection-bar__next"
                            disabled={forwardSelectedMessageIds.length === 0}
                            onClick={openForwardTargets}
                        >
                            Siguiente
                        </button>
                    </div>
                </div>
            )}
            {forwardMode && forwardStep === 'targets' && (
                <div className="chat-forward-target-overlay" onClick={() => setForwardStep('messages')}>
                <div className="chat-forward-panel chat-forward-panel--targets" onClick={(event) => event.stopPropagation()}>
                    <div className="chat-forward-panel__header">
                        <div>
                            <strong>↪ Reenviar mensaje</strong>
                            <span>{forwardSelectedMessageIds.length} mensaje{forwardSelectedMessageIds.length === 1 ? '' : 's'} seleccionado{forwardSelectedMessageIds.length === 1 ? '' : 's'}</span>
                        </div>
                        <button type="button" onClick={cancelForwardMode}>✕ Cancelar</button>
                    </div>
                    <input
                        className="chat-forward-panel__search"
                        type="text"
                        placeholder="Buscar contacto o chat..."
                        value={forwardSearch}
                        onChange={(event) => setForwardSearch(event.target.value)}
                    />
                    <div className="chat-forward-panel__section-label">
                        {forwardNeedle ? 'Resultados' : 'Recientes'}
                    </div>
                    <div className="chat-forward-panel__list">
                        {forwardVisibleCandidates.length > 0 ? forwardVisibleCandidates.map((chat) => {
                            const chatId = String(chat?.id || '').trim();
                            const selected = forwardSelectedChatSet.has(chatId);
                            return (
                                <button
                                    key={chatId}
                                    type="button"
                                    className={`chat-forward-target ${selected ? 'selected' : ''}`}
                                    onClick={() => toggleForwardTarget(chatId)}
                                >
                                    <span className="chat-forward-target__check">{selected ? '✓' : '○'}</span>
                                    <span className="chat-forward-target__copy">
                                        <strong>{chat?.name || chat?.phone || 'Chat'}</strong>
                                        {(chat?.phone || chat?.subtitle) && <small>{chat?.phone || chat?.subtitle}</small>}
                                    </span>
                                </button>
                            );
                        }) : (
                            <div className="chat-forward-panel__empty">No se encontraron chats.</div>
                        )}
                    </div>
                    <div className="chat-forward-panel__footer">
                        <span>{forwardSelectedChatIds.length} destino{forwardSelectedChatIds.length === 1 ? '' : 's'} seleccionado{forwardSelectedChatIds.length === 1 ? '' : 's'}</span>
                        <button
                            type="button"
                            className="chat-forward-panel__submit"
                            disabled={forwardSelectedMessageIds.length === 0 || forwardSelectedChatIds.length === 0}
                            onClick={submitForwardMessages}
                        >
                            Reenviar →
                        </button>
                    </div>
                </div>
                </div>
            )}
            {canWriteByAssignment ? (
                <>
                    {!conversationWindowOpen && (
                        <div className="chat-window-expired-banner chat-window-closed-banner">
                            <div className="chat-window-expired-banner-copy">
                                <span className="chat-window-expired-banner-title banner-title banner-title--desktop">Ventana de 24 horas cerrada</span>
                                <span className="chat-window-expired-banner-title banner-title banner-title--mobile">⏰ Ventana de 24h cerrada</span>
                                <span className="chat-window-expired-banner-text banner-text-long">
                                    La ventana de conversación expiró. Solo puedes contactar con un template aprobado.
                                </span>
                            </div>
                            <div className="chat-window-expired-banner-actions banner-actions">
                                <button
                                    type="button"
                                    className="chat-window-expired-banner-action"
                                    onClick={() => inputProps?.onOpenSendTemplate?.()}
                                >
                                    Enviar template
                                </button>
                                <button
                                    type="button"
                                    className="chat-window-expired-banner-action chat-window-expired-banner-action--secondary"
                                    title="Escribe directamente desde WhatsApp Business sin costo de plantilla"
                                    onClick={() => inputProps?.onOpenDirectWhatsApp?.()}
                                >
                                    📱 Abrir en WhatsApp
                                </button>
                            </div>
                        </div>
                    )}
                    <ChatInput
                        {...inputProps}
                        replyingMessage={inputProps?.replyingMessage}
                        onCancelReplyMessage={inputProps?.onCancelReplyMessage}
                        onOpenMapPicker={() => openMapModal({ query: '' })}
                        buildApiHeaders={buildApiHeaders}
                        activeChatDetails={activeChatDetails}
                        activeTenantId={activeTenantId}
                        windowOpen={conversationWindowOpen}
                        focusChatKey={activeChatScopedId}
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
                            needsAdvisor={Boolean(activeChatCommercialStatus?.needsAdvisor)}
                            needsAdvisorReason={activeChatCommercialStatus?.needsAdvisorReason || ''}
                            virtualAssigneeLabel={showPattyAssignee ? 'Patty IA' : ''}
                        />
                        <span className="chat-assignment-lock-text">
                            {activeChatCommercialStatus?.needsAdvisor
                                ? '⚠️ Solicita asistencia · Tomar chat'
                                : showPattyAssignee
                                    ? 'Patty IA está respondiendo · Tomar chat'
                                    : 'Sin asignar · Toma este chat para responder al cliente'}
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
