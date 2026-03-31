import React from 'react';
import { MoreVertical, Search, X, SlidersHorizontal, Tags, Tag, Users, UserRoundX, Archive, Pin, CheckCheck, UserCheck } from 'lucide-react';
import ChannelBrandIcon from './ChannelBrandIcon';
import AssignmentBadge from './assignment/AssignmentBadge';
import useSidebarFiltersController from './hooks/useSidebarFiltersController';
import useSidebarChatPresentationModel from './hooks/useSidebarChatPresentationModel';
import useSidebarInfiniteScroll from './hooks/useSidebarInfiniteScroll';
import useSidebarUiToggles from './hooks/useSidebarUiToggles';


const normalizePhoneDigits = (value = '') => String(value || '').replace(/\D/g, '');

const repairMojibake = (value = '') => {
    let text = String(value || '');
    if (!text) return '';

    try {
        const decoded = decodeURIComponent(escape(text));
        const cleanDecoded = decoded.replace(/\uFFFD/g, '');
        const cleanOriginal = text.replace(/\uFFFD/g, '');
        if (decoded && decoded !== text && cleanDecoded.length >= Math.floor(cleanOriginal.length * 0.8)) {
            text = decoded;
        }
    } catch (e) { }

    return text.replace(/\uFFFD/g, '');
};

const sanitizeDisplayText = (value = '') => repairMojibake(value)
    .replace(/[\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const Sidebar = ({
    chats,
    chatsLoaded = false,
    activeChatId,
    onChatSelect,
    myProfile,
    onLogout,
    onRefreshChats,
    onStartNewChat,
    labelDefinitions,
    onCreateLabel,
    onLoadMoreChats,
    chatsHasMore = false,
    chatsLoadingMore = false,
    chatsTotal = 0,
    searchQuery = '',
    onSearchQueryChange,
    activeFilters = {},
    onFiltersChange,
    onOpenCompanyProfile,
    saasAuthEnabled = false,
    tenantOptions = [],
    activeTenantId = '',
    tenantSwitchError = '',
    onSaasLogout,
    canManageSaas = false,
    onOpenSaasAdmin,
    waModules = [],
    chatAssignmentState = null,
    showBackToPanel = false,
    onBackToPanel = null,
}) => {
    const {
        showMenu,
        setShowMenu,
        showLabelPanel,
        setShowLabelPanel
    } = useSidebarUiToggles();
    const {
        filters,
        updateFilters,
        visibleLabels,
        quickStats,
        activeFilterChips,
        filteredChats,
        resetFilters,
        toggleLabel,
        labelSearch,
        setLabelSearch,
        selectedLabelCount,
        hasAnyFilter,
        assignmentUserOptions
    } = useSidebarFiltersController({
        chats,
        activeFilters,
        labelDefinitions,
        waModules,
        chatAssignmentState,
        onFiltersChange,
        searchQuery
    });
    const {
        formatTime,
        renderStatus,
        getDisplayName,
        getContactHint,
        getChannelBadge,
        getChannelMarker,
        avatarLetter,
        avatarColor
    } = useSidebarChatPresentationModel();
    const { handleChatListScroll } = useSidebarInfiniteScroll({
        onLoadMoreChats,
        chatsHasMore,
        isLoadingMoreChats: chatsLoadingMore
    });

    const localQuery = String(searchQuery || '');
    const normalizedPhone = normalizePhoneDigits(localQuery);
    const queryHasLetters = /[a-zA-Z]/.test(localQuery);
    const searchIsPhone = !queryHasLetters && normalizedPhone.length >= 6 && normalizedPhone.length <= 15;
    const hasPanelAccess = Boolean(saasAuthEnabled && canManageSaas);
    const getAssignment = typeof chatAssignmentState?.getAssignment === 'function'
        ? chatAssignmentState.getAssignment
        : (() => null);
    const isAssignedToMeResolver = typeof chatAssignmentState?.isAssignedToMe === 'function'
        ? chatAssignmentState.isAssignedToMe
        : (() => false);
    const assignmentsLoaded = Boolean(chatAssignmentState?.assignmentsLoaded);

    const currentTenantId = String(activeTenantId || '').trim();
    const sortedTenantOptions = Array.isArray(tenantOptions)
        ? [...tenantOptions].sort((a, b) => String(a?.name || a?.id || '').localeCompare(String(b?.name || b?.id || '')))
        : [];
    const activeTenantOption = sortedTenantOptions.find((tenant) => String(tenant?.id || '').trim() === currentTenantId) || sortedTenantOptions[0] || null;
    const activeTenantLabel = activeTenantOption?.name || activeTenantOption?.id || currentTenantId || 'default';

    return (
        <div className="sidebar sidebar-pro">
            <div className="sidebar-header sidebar-header-pro">
                <button
                    type="button"
                    className="sidebar-account-block sidebar-account-trigger"
                    onClick={() => { onOpenCompanyProfile?.(); setShowMenu(false); }}
                    title="Ver perfil de la empresa"
                >
                    <div
                        className="sidebar-account-avatar"
                        style={{
                            background: myProfile?.profilePicUrl
                                ? `url(${myProfile.profilePicUrl}) center/cover`
                                : '#3b4a54',
                        }}
                    >
                        {!myProfile?.profilePicUrl && (myProfile?.pushname?.charAt(0)?.toUpperCase() || '?')}
                    </div>
                    {myProfile?.pushname && (
                        <span className="sidebar-account-name">{myProfile.pushname}</span>
                    )}
                </button>

                <div className="sidebar-header-actions">
                    <button
                        type="button"
                        className="ui-icon-btn"
                        onClick={() => setShowMenu((v) => !v)}
                        title="Mas opciones"
                    >
                        <MoreVertical size={18} />
                    </button>

                    {showMenu && (
                        <div className="sidebar-dropdown-menu">
                            {saasAuthEnabled && (
                                <div className="sidebar-menu-section">
                                    <div className="sidebar-menu-section-title">Empresa activa</div>
                                    <div className="sidebar-menu-tenant-label" title={activeTenantLabel}>
                                        {activeTenantLabel}
                                    </div>
                                    {tenantSwitchError && (
                                        <div className="sidebar-menu-error">{tenantSwitchError}</div>
                                    )}
                                </div>
                            )}
                            {hasPanelAccess && (
                                <button
                                    type="button"
                                    className="sidebar-menu-item"
                                    onClick={() => {
                                        if (showBackToPanel && typeof onBackToPanel === 'function') {
                                            onBackToPanel();
                                        } else {
                                            onOpenSaasAdmin?.();
                                        }
                                        setShowMenu(false);
                                    }}
                                >
                                    {showBackToPanel ? 'Volver al panel SaaS' : 'Panel SaaS (empresas/usuarios)'}
                                </button>
                            )}
                            <button type="button" className="sidebar-menu-item" onClick={() => { onStartNewChat?.(); setShowMenu(false); }}>
                                Nuevo chat (numero)
                            </button>
                            <button type="button" className="sidebar-menu-item" onClick={() => { onRefreshChats?.(); setShowMenu(false); }}>
                                Recargar chats
                            </button>
                            {canManageSaas && (
                                <button type="button" className="sidebar-menu-item" onClick={() => { onCreateLabel?.(); setShowMenu(false); }}>
                                    Gestionar etiquetas
                                </button>
                            )}
                            <button type="button" className="sidebar-menu-item sidebar-menu-item-danger" onClick={() => { onLogout?.(); setShowMenu(false); }}>
                                Cerrar sesion WhatsApp
                            </button>
                            {saasAuthEnabled && (
                                <button type="button" className="sidebar-menu-item sidebar-menu-item-danger" onClick={() => { onSaasLogout?.(); setShowMenu(false); }}>
                                    Cerrar sesion SaaS
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="sidebar-search-zone">
                <div className="sidebar-search-box">
                    <Search size={16} />
                    <input
                        type="text"
                        placeholder="Busca chat o escribe numero"
                        className="sidebar-search-input"
                        value={localQuery}
                        onChange={(e) => onSearchQueryChange?.(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && searchIsPhone) {
                                e.preventDefault();
                                onStartNewChat?.(normalizedPhone, '');
                                onSearchQueryChange?.('');
                            }
                        }}
                    />
                    {localQuery && (
                        <button type="button" className="ui-icon-btn ui-icon-btn-sm" onClick={() => onSearchQueryChange?.('')}>
                            <X size={14} />
                        </button>
                    )}
                </div>

                {searchIsPhone && (
                    <button
                        type="button"
                        className="ui-btn ui-btn--primary ui-btn--block"
                        onClick={() => {
                            onStartNewChat?.(normalizedPhone, '');
                            onSearchQueryChange?.('');
                        }}
                    >
                        Abrir chat con +{normalizedPhone}
                    </button>
                )}
            </div>

            <div className="sidebar-main-content">
                    <div className="sidebar-left-ribbon" aria-label="Filtros de chat">
                        <button
                            type="button"
                            className={`sidebar-ribbon-btn ${!hasAnyFilter ? 'active' : ''}`}
                            onClick={resetFilters}
                            title="Todos"
                            data-label="Todos"
                        >
                            <SlidersHorizontal size={18} />
                        </button>
                        <button
                            type="button"
                            className={`sidebar-ribbon-btn ${filters.unreadOnly ? 'active' : ''}`}
                            onClick={() => updateFilters({ unreadOnly: !filters.unreadOnly })}
                            title="No leidos"
                            data-label="No leidos"
                        >
                            <CheckCheck size={18} />
                            {quickStats.unread > 0 && <span className="sidebar-ribbon-badge">{quickStats.unread > 9 ? '9+' : quickStats.unread}</span>}
                        </button>
                        <button
                            type="button"
                            className={`sidebar-ribbon-btn ${filters.unlabeledOnly ? 'active' : ''}`}
                            onClick={() => updateFilters({ unlabeledOnly: !filters.unlabeledOnly, labelTokens: [] })}
                            title="Sin etiqueta"
                            data-label="Sin etiqueta"
                        >
                            <Tags size={18} />
                        </button>
                        <button
                            type="button"
                            className={`sidebar-ribbon-btn ${filters.archivedMode === 'archived' ? 'active' : ''}`}
                            onClick={() => updateFilters({ archivedMode: filters.archivedMode === 'archived' ? 'all' : 'archived' })}
                            title="Archivados"
                            data-label="Archivados"
                        >
                            <Archive size={18} />
                        </button>
                        <button
                            type="button"
                            className={`sidebar-ribbon-btn ${filters.pinnedMode === 'pinned' ? 'active' : ''}`}
                            onClick={() => updateFilters({ pinnedMode: filters.pinnedMode === 'pinned' ? 'all' : 'pinned' })}
                            title="Fijados"
                            data-label="Fijados"
                        >
                            <Pin size={18} />
                            {quickStats.pinned > 0 && <span className="sidebar-ribbon-badge">{quickStats.pinned > 9 ? '9+' : quickStats.pinned}</span>}
                        </button>
                        <button
                            type="button"
                            className={`sidebar-ribbon-btn ${filters.contactMode === 'my' ? 'active' : ''}`}
                            onClick={() => updateFilters({ contactMode: filters.contactMode === 'my' ? 'all' : 'my' })}
                            title="Guardados"
                            data-label="Guardados"
                        >
                            <Users size={18} />
                        </button>
                        <button
                            type="button"
                            className={`sidebar-ribbon-btn ${filters.contactMode === 'unknown' ? 'active' : ''}`}
                            onClick={() => updateFilters({ contactMode: filters.contactMode === 'unknown' ? 'all' : 'unknown' })}
                            title="No guardados"
                            data-label="No guardados"
                        >
                            <UserRoundX size={18} />
                            {quickStats.unknown > 0 && <span className="sidebar-ribbon-badge">{quickStats.unknown > 9 ? '9+' : quickStats.unknown}</span>}
                        </button>
                        <button
                            type="button"
                            className={`sidebar-ribbon-btn ${filters.onlyAssignedToMe ? 'active' : ''}`}
                            onClick={() => updateFilters({ onlyAssignedToMe: !filters.onlyAssignedToMe })}
                            title="Solo mis chats"
                            data-label="Solo mios"
                        >
                            <UserCheck size={18} />
                            {quickStats.assignedToMe > 0 && <span className="sidebar-ribbon-badge">{quickStats.assignedToMe > 9 ? '9+' : quickStats.assignedToMe}</span>}
                        </button>
                        <button
                            type="button"
                            className={`sidebar-ribbon-btn ${showLabelPanel || selectedLabelCount > 0 ? 'active' : ''}`}
                            onClick={() => setShowLabelPanel((v) => !v)}
                            title="Etiquetas"
                            data-label="Etiquetas"
                        >
                            <Tag size={18} />
                            {selectedLabelCount > 0 && <span className="sidebar-ribbon-badge">{selectedLabelCount > 9 ? '9+' : selectedLabelCount}</span>}
                        </button>
                    </div>
                    <div className="sidebar-main-column">
                        <div className="sidebar-filter-content">
                        <div className="sidebar-filter-content-top">
                            <div className="sidebar-active-filters-row">
                                {!hasAnyFilter ? (
                                    <span className="sidebar-active-filter-empty">Sin filtros activos</span>
                                ) : (
                                    activeFilterChips.map((chip, index) => (
                                        <span key={`${chip}_${index}`} className="sidebar-active-filter-chip">
                                            {chip}
                                        </span>
                                    ))
                                )}
                            </div>
                            {assignmentsLoaded && (
                                <label className="assignment-selector" style={{ marginTop: '8px', marginLeft: 0 }}>
                                    <span className="assignment-selector-label">Vendedora</span>
                                    <select
                                        value={filters.assigneeUserId || ''}
                                        onChange={(event) => updateFilters({ assigneeUserId: String(event.target.value || '').trim() })}
                                        className="assignment-selector-select"
                                        title="Filtrar por asignacion"
                                    >
                                        <option value="">Todas las vendedoras</option>
                                        <option value="__unassigned__">Sin asignar</option>
                                        {assignmentUserOptions.map((entry) => (
                                            <option key={entry.value} value={entry.value}>
                                                {entry.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            )}
                            {hasAnyFilter && (
                                <button type="button" className="sidebar-filter-clear" onClick={resetFilters}>Limpiar</button>
                            )}
                        </div>

                        {showLabelPanel && (
                            <div className="sidebar-label-dropdown" role="dialog" aria-label="Filtrar por etiquetas">
                                <div className="sidebar-label-dropdown-header">Filtro de etiquetas (seleccion multiple)</div>
                                <div className="sidebar-label-search-row">
                                    <Search size={14} />
                                    <input
                                        type="text"
                                        value={labelSearch}
                                        onChange={(e) => setLabelSearch(e.target.value)}
                                        placeholder="Buscar etiqueta"
                                        className="sidebar-label-search-input"
                                    />
                                </div>
                                <div className="sidebar-label-list">
                                    {visibleLabels.length === 0 ? (
                                        <div className="sidebar-label-empty">No hay etiquetas para mostrar</div>
                                    ) : (
                                        visibleLabels.map((label) => {
                                            const isSelected = filters.labelTokens.includes(label.token);
                                            return (
                                                <button
                                                    key={label.token}
                                                    type="button"
                                                    className={`sidebar-label-item ${isSelected ? 'active' : ''}`}
                                                    onClick={() => toggleLabel(label.token)}
                                                >
                                                    <span className="sidebar-label-color" style={{ background: label.color || '#7D8D95' }} />
                                                    <span className="sidebar-label-name">{label.name}</span>
                                                    <span className="sidebar-label-count">{label.count}</span>
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
            <div className="chat-list" onClick={() => { if (showMenu) setShowMenu(false); if (showLabelPanel) setShowLabelPanel(false); }} onScroll={handleChatListScroll}>
                {filteredChats.length === 0 && chats.length === 0 && !chatsLoaded ? (
                    [1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="chat-item chat-item-modern">
                            <div className="chat-avatar skeleton" style={{ width: '49px', height: '49px', borderRadius: '50%', flexShrink: 0 }}></div>
                            <div className="chat-info" style={{ marginLeft: '15px', flex: 1 }}>
                                <div className="skeleton" style={{ height: '14px', width: '60%', marginBottom: '10px' }}></div>
                                <div className="skeleton" style={{ height: '10px', width: '40%' }}></div>
                            </div>
                        </div>
                    ))
                ) : filteredChats.length === 0 ? (
                    <div className="sidebar-empty-search">
                        Sin resultados para "{localQuery || 'los filtros actuales'}"
                    </div>
                ) : (
                    filteredChats.map((chat) => {
                        const displayName = getDisplayName(chat);
                        const contactHint = getContactHint(chat, displayName);
                        const moduleBadge = getChannelBadge(chat, waModules);
                        const channelMarker = getChannelMarker(moduleBadge?.channelType || '');
                        const chatAssignment = getAssignment(chat.id);
                        const isAssignedToMe = isAssignedToMeResolver(chat.id);
                        const moduleAvatarImage = moduleBadge?.imageUrl || null;
                        const avatarFallback = moduleBadge?.moduleName
                            ? avatarLetter(moduleBadge.moduleName)
                            : avatarLetter(displayName);
                        const lastMessage = sanitizeDisplayText(chat.lastMessage || '') || 'Haz clic para chatear';
                        const labels = Array.isArray(chat?.labels) ? chat.labels : [];
                        return (
                            <div
                                key={chat.id}
                                className={`chat-item chat-item-modern ${activeChatId === chat.id ? 'active' : ''}`}
                                onClick={() => onChatSelect(chat.id, { clearSearch: true })}
                            >
                                <div
                                    className="chat-avatar-modern chat-avatar-modern--module"
                                    style={{ background: moduleAvatarImage ? `url(${moduleAvatarImage}) center/cover` : avatarColor(moduleBadge?.moduleName || displayName) }}
                                >
                                    {!moduleAvatarImage && avatarFallback}
                                    <span
                                        className={`chat-avatar-channel-tag chat-avatar-channel-tag--${channelMarker.key}`}
                                        title={channelMarker.label}
                                    >
                                        <ChannelBrandIcon
                                            channelType={channelMarker.key}
                                            className="chat-avatar-channel-icon"
                                            size={11}
                                            title={channelMarker.label}
                                        />
                                    </span>
                                </div>

                                <div className="chat-info chat-info-modern">
                                    <div className="chat-row-top">
                                        <div className="chat-name-stack">
                                            <span className="chat-display-name">{displayName}</span>
                                            {contactHint && <span className="chat-contact-hint">{contactHint}</span>}
                                        </div>
                                        <span className={`chat-time ${chat.unreadCount > 0 ? 'chat-time-unread' : ''}`}>
                                            {formatTime(chat.timestamp)}
                                        </span>
                                    </div>

                                    <div className="chat-row-meta">
                                        {moduleBadge?.label && (
                                            <p className="chat-module-badge chat-module-badge--compact">
                                                <span className="chat-module-badge-media">
                                                    {moduleBadge.imageUrl
                                                        ? <img src={moduleBadge.imageUrl} alt={moduleBadge.label} className="chat-module-badge-avatar" />
                                                        : <span className="chat-module-badge-dot" aria-hidden="true" />}
                                                    {moduleBadge?.channelType && (
                                                        <span
                                                            className={`chat-module-badge-channel chat-module-badge-channel--${channelMarker.key}`}
                                                            title={channelMarker.label}
                                                        >
                                                            <ChannelBrandIcon
                                                                channelType={channelMarker.key}
                                                                className="chat-module-badge-channel-icon"
                                                                size={8}
                                                                title={channelMarker.label}
                                                            />
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="chat-module-badge-label">{moduleBadge.label}</span>
                                            </p>
                                        )}
                                        <AssignmentBadge
                                            assignment={chatAssignment}
                                            isAssignedToMe={isAssignedToMe}
                                            compact
                                        />

                                        {labels.length > 0 && (
                                            <div
                                                className="chat-inline-labels chat-inline-labels--dots"
                                                title={labels.map((label) => String(label?.name || '').trim()).filter(Boolean).join(', ')}
                                            >
                                                {labels.slice(0, 4).map((label, idx) => (
                                                    <span
                                                        key={`${label?.id || label?.name || 'l'}_${idx}`}
                                                        className="chat-inline-label-dot"
                                                        style={{ '--label-color': label?.color || '#7D8D95' }}
                                                    />
                                                ))}
                                                {labels.length > 4 && <span className="chat-inline-label-more">+{labels.length - 4}</span>}
                                            </div>
                                        )}
                                    </div>

                                    <div className="chat-row-bottom">
                                        <p className="chat-last-message">
                                            {renderStatus(chat)}
                                            <span>{lastMessage}</span>
                                        </p>
                                        {chat.unreadCount > 0 && <span className="unread-badge">{chat.unreadCount}</span>}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}

                {chats.length > 0 && (
                    <div className="sidebar-list-footer">
                        {chatsLoadingMore
                            ? 'Cargando mas chats...'
                            : (chatsHasMore
                                ? `Mostrando ${chats.length} de ${chatsTotal || '...'} chats`
                                : `Mostrando todos los chats (${chats.length})`)}
                    </div>
                )}
            </div>
                </div>
            </div>
        </div>
    );
};

export default Sidebar;


























