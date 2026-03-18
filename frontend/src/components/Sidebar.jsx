import React, { useMemo, useState } from 'react';
import { MoreVertical, Search, Check, CheckCheck, X, SlidersHorizontal, Tags, Tag, Users, UserRoundX, Archive, Pin } from 'lucide-react';
import moment from 'moment';
import ChannelBrandIcon from './ChannelBrandIcon';

const WA_LABEL_COLORS = ['#25D366', '#34B7F1', '#FFB02E', '#FF5C5C', '#9C6BFF', '#00A884', '#7D8D95'];

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const normalizeModuleImageUrl = (rawUrl = '') => {
    const value = String(rawUrl || '').trim();
    if (!value) return null;
    if (value.startsWith('data:') || value.startsWith('blob:')) return value;
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith('/')) return `${API_URL}${value}`;
    return `${API_URL}/${value}`;
};


const normalizePhoneDigits = (value = '') => String(value || '').replace(/\D/g, '');
const normalizeFilterToken = (value = '') => String(value || '').trim().toLowerCase();
const CHAT_SCOPE_SEPARATOR = '::mod::';
const normalizeModuleKey = (value = '') => String(value || '').trim().toLowerCase();
const parseScopedChatId = (value = '') => {
    const raw = String(value || '').trim();
    if (!raw) return { baseChatId: '', scopeModuleId: '' };
    const idx = raw.lastIndexOf(CHAT_SCOPE_SEPARATOR);
    if (idx < 0) return { baseChatId: raw, scopeModuleId: '' };
    const baseChatId = String(raw.slice(0, idx) || '').trim();
    const scopeModuleId = normalizeModuleKey(raw.slice(idx + CHAT_SCOPE_SEPARATOR.length));
    if (!baseChatId || !scopeModuleId) return { baseChatId: raw, scopeModuleId: '' };
    return { baseChatId, scopeModuleId };
};

const normalizeFilters = (filters = {}) => {
    const rawTokens = Array.isArray(filters?.labelTokens) ? filters.labelTokens : [];
    const seen = new Set();
    const labelTokens = [];
    for (const token of rawTokens) {
        const clean = normalizeFilterToken(token);
        if (!clean || seen.has(clean)) continue;
        seen.add(clean);
        labelTokens.push(clean);
    }

    const contactMode = ['all', 'my', 'unknown'].includes(String(filters?.contactMode || 'all'))
        ? String(filters?.contactMode || 'all')
        : 'all';
    const archivedMode = ['all', 'archived', 'active'].includes(String(filters?.archivedMode || 'all'))
        ? String(filters?.archivedMode || 'all')
        : 'all';
    const pinnedMode = ['all', 'pinned', 'unpinned'].includes(String(filters?.pinnedMode || 'all'))
        ? String(filters?.pinnedMode || 'all')
        : 'all';

    return {
        labelTokens,
        unreadOnly: Boolean(filters?.unreadOnly),
        unlabeledOnly: Boolean(filters?.unlabeledOnly),
        contactMode,
        archivedMode,
        pinnedMode,
    };
};

const formatPhone = (value = '') => {
    const digits = normalizePhoneDigits(value);
    return digits ? `+${digits}` : '';
};

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

const getLabelToken = (label = {}) => {
    const id = normalizeFilterToken(label?.id);
    if (id) return `id:${id}`;
    const name = normalizeFilterToken(label?.name);
    if (name) return `name:${name}`;
    return '';
};

const getChatLabelTokenSet = (chat = {}) => {
    const set = new Set();
    const labels = Array.isArray(chat?.labels) ? chat.labels : [];
    labels.forEach((label) => {
        const token = getLabelToken(label);
        if (token) set.add(token);
    });
    return set;
};

const Sidebar = ({
    chats,
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
    showBackToPanel = false,
    onBackToPanel = null,
}) => {
    const [showMenu, setShowMenu] = useState(false);
    const [showLabelPanel, setShowLabelPanel] = useState(false);
    const [labelSearch, setLabelSearch] = useState('');

    const filters = normalizeFilters(activeFilters);

    const updateFilters = (patch = {}) => {
        const next = normalizeFilters({ ...filters, ...patch });
        onFiltersChange?.(next);
    };

    const localQuery = String(searchQuery || '');
    const normalizedPhone = normalizePhoneDigits(localQuery);
    const queryHasLetters = /[a-zA-Z]/.test(localQuery);
    const searchIsPhone = !queryHasLetters && normalizedPhone.length >= 6 && normalizedPhone.length <= 15;

    const formatTime = (ts) => {
        if (!Number.isFinite(Number(ts)) || Number(ts) <= 0) return '';
        const m = moment.unix(ts || 0);
        if (!m.isValid()) return '';
        if (m.isSame(moment(), 'day')) return m.format('H:mm');
        if (m.isSame(moment().subtract(1, 'day'), 'day')) return 'Ayer';
        return m.format('DD/MM/YY');
    };

    const renderStatus = (chat) => {
        if (!chat.lastMessageFromMe) return null;
        const color = chat.ack === 3 ? '#53bdeb' : '#8696a0';
        return (
            <span className="chat-last-status-icon">
                {chat.ack >= 2 ? <CheckCheck size={16} color={color} /> : <Check size={16} color="#8696a0" />}
            </span>
        );
    };

    const allLabels = useMemo(() => {
        const map = new Map();
        const counts = new Map();

        const register = (label, idx = 0) => {
            const token = getLabelToken(label);
            if (!token) return;
            if (!map.has(token)) {
                const id = label?.id ?? null;
                const fallbackName = id !== null && id !== undefined ? `Etiqueta ${id}` : 'Etiqueta';
                map.set(token, {
                    token,
                    id,
                    name: String(label?.name || fallbackName).trim(),
                    color: label?.color || WA_LABEL_COLORS[idx % WA_LABEL_COLORS.length],
                });
            }
        };

        (labelDefinitions || []).forEach((label, idx) => register(label, idx));
        chats.forEach((chat) => {
            const chatTokens = new Set();
            (chat?.labels || []).forEach((label, idx) => {
                register(label, idx);
                const token = getLabelToken(label);
                if (token) chatTokens.add(token);
            });
            chatTokens.forEach((token) => counts.set(token, (counts.get(token) || 0) + 1));
        });

        return Array.from(map.values())
            .map((label) => ({ ...label, count: counts.get(label.token) || 0 }))
            .sort((a, b) => {
                if (b.count !== a.count) return b.count - a.count;
                return a.name.localeCompare(b.name);
            });
    }, [chats, labelDefinitions]);

    const normalizedLabelSearch = String(labelSearch || '').trim().toLowerCase();
    const visibleLabels = normalizedLabelSearch
        ? allLabels.filter((label) => `${label.name}`.toLowerCase().includes(normalizedLabelSearch))
        : allLabels;

    const selectedLabelCount = filters.labelTokens.length;
    const hasActiveQuickFilters = filters.unreadOnly || filters.unlabeledOnly || filters.contactMode !== 'all' || filters.archivedMode !== 'all' || filters.pinnedMode !== 'all';
    const hasAnyFilter = hasActiveQuickFilters || selectedLabelCount > 0;
    const hasPanelAccess = Boolean(saasAuthEnabled && canManageSaas);

    const quickStats = useMemo(() => {
        const unread = chats.filter((c) => Number(c?.unreadCount || 0) > 0).length;
        const unlabeled = chats.filter((c) => (Array.isArray(c?.labels) ? c.labels.length : 0) === 0).length;
        const myContacts = chats.filter((c) => c?.isMyContact === true).length;
        const unknown = chats.filter((c) => c?.isMyContact !== true).length;
        const archived = chats.filter((c) => Boolean(c?.archived)).length;
        const pinned = chats.filter((c) => Boolean(c?.pinned)).length;
        return { unread, unlabeled, myContacts, unknown, archived, pinned };
    }, [chats]);
    const activeFilterChips = useMemo(() => {
        const chips = [];
        if (!hasAnyFilter) return chips;
        if (filters.unreadOnly) chips.push('No leidos');
        if (filters.unlabeledOnly) chips.push('Sin etiqueta');
        if (filters.archivedMode === 'archived') chips.push('Archivados');
        if (filters.pinnedMode === 'pinned') chips.push('Fijados');
        if (filters.contactMode === 'my') chips.push('Guardados');
        if (filters.contactMode === 'unknown') chips.push('No guardados');
        if (filters.labelTokens.length > 0) chips.push(`Etiquetas (${filters.labelTokens.length})`);
        return chips;
    }, [filters, hasAnyFilter]);

    const filteredChats = chats.filter((chat) => {
        const labelTokenSet = getChatLabelTokenSet(chat);

        if (filters.unreadOnly && Number(chat?.unreadCount || 0) <= 0) return false;
        if (filters.contactMode === 'my' && !chat?.isMyContact) return false;
        if (filters.contactMode === 'unknown' && chat?.isMyContact) return false;
        if (filters.archivedMode === 'archived' && !chat?.archived) return false;
        if (filters.archivedMode === 'active' && chat?.archived) return false;
        if (filters.pinnedMode === 'pinned' && !chat?.pinned) return false;
        if (filters.pinnedMode === 'unpinned' && chat?.pinned) return false;
        if (filters.unlabeledOnly && labelTokenSet.size > 0) return false;

        if (!filters.unlabeledOnly && filters.labelTokens.length > 0) {
            const hasLabel = filters.labelTokens.some((token) => labelTokenSet.has(normalizeFilterToken(token)));
            if (!hasLabel) return false;
        }

        const q = String(localQuery || '').trim().toLowerCase();
        if (!q) return true;

        const qDigits = normalizePhoneDigits(q);
        const name = String(chat?.name || '').toLowerCase();
        const subtitle = String(chat?.subtitle || '').toLowerCase();
        const status = String(chat?.status || '').toLowerCase();
        const lastMessage = String(chat?.lastMessage || '').toLowerCase();
        const phone = normalizePhoneDigits(chat?.phone || chat?.id || '');

        if (qDigits) {
            return phone.includes(qDigits) || normalizePhoneDigits(subtitle).includes(qDigits);
        }

        return name.includes(q) || subtitle.includes(q) || status.includes(q) || lastMessage.includes(q);
    });

    const handleChatListScroll = (e) => {
        if (!onLoadMoreChats || !chatsHasMore || chatsLoadingMore) return;
        const el = e.currentTarget;
        const nearBottom = (el.scrollTop + el.clientHeight) >= (el.scrollHeight - 120);
        if (nearBottom) onLoadMoreChats();
    };

    const avatarLetter = (name) => (name ? name.charAt(0).toUpperCase() : '?');
    const avatarColor = (name) => {
        const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444'];
        if (!name) return colors[0];
        return colors[name.charCodeAt(0) % colors.length];
    };

    const isInternalIdentifier = (value = '') => {
        const text = String(value || '').trim();
        if (!text) return false;
        return text.includes('@') || /^\d{14,}$/.test(text);
    };

    const getDisplayName = (chat) => {
        const rawName = sanitizeDisplayText(chat?.name || '');
        const phone = formatPhone(chat?.phone || chat?.id || '');
        if (rawName && !isInternalIdentifier(rawName)) return rawName;
        if (phone) return phone;
        return 'Sin nombre';
    };

    const isHumanSubtitle = (value = '') => {
        const text = String(value || '').trim();
        if (!text) return false;
        if (text.includes('@')) return false;
        const onlyDigitsAndSymbols = text.replace(/[\d\s+().-]/g, '');
        if (!onlyDigitsAndSymbols && normalizePhoneDigits(text).length >= 10) return false;
        return true;
    };

    const getSubtitle = (chat) => {
        const statusText = sanitizeDisplayText(chat?.status || '');
        const subtitleText = sanitizeDisplayText(chat?.subtitle || '');
        const phone = formatPhone(chat?.phone || chat?.id || '');
        const displayName = getDisplayName(chat);

        const candidates = [statusText, subtitleText]
            .filter((v) => isHumanSubtitle(v) && !isInternalIdentifier(v) && v !== displayName);

        if (candidates.length > 0) {
            const primary = candidates[0];
            if (phone && primary !== phone) return primary + ' - ' + phone;
            return primary;
        }

        if (phone && phone !== displayName) return phone;
        return '';
    };

    const getChannelBadge = (chat) => {
        const parsed = parseScopedChatId(chat?.id || '');
        const chatModuleId = normalizeModuleKey(
            chat?.lastMessageModuleId
            || chat?.scopeModuleId
            || parsed?.scopeModuleId
            || ''
        );
        const rawModuleName = sanitizeDisplayText(chat?.lastMessageModuleName || '');
        const normalizedModuleName = String(rawModuleName || '').trim().toLowerCase();
        const moduleConfig = Array.isArray(waModules)
            ? (
                waModules.find((entry) => normalizeModuleKey(entry?.moduleId || entry?.id || '') === chatModuleId)
                || waModules.find((entry) => normalizedModuleName && String(entry?.name || '').trim().toLowerCase() === normalizedModuleName)
                || null
            )
            : null;

        const resolvedModuleId = normalizeModuleKey(chatModuleId || moduleConfig?.moduleId || moduleConfig?.id || '');
        const moduleName = sanitizeDisplayText(rawModuleName || moduleConfig?.name || '');
        const moduleId = String(resolvedModuleId || '').trim().toUpperCase();
        const channelType = String(chat?.lastMessageChannelType || moduleConfig?.channelType || '').trim().toLowerCase();
        const channelLabel = channelType ? channelType.toUpperCase() : '';
        const sourceRaw = moduleName || moduleId;
        const source = String(sourceRaw || '').replace(/\s*\|\s*(whatsapp|instagram|messenger|facebook|webchat)\s*$/i, '').trim() || sourceRaw;
        const imageUrl = normalizeModuleImageUrl(
            chat?.lastMessageModuleImageUrl
            || moduleConfig?.imageUrl
            || moduleConfig?.logoUrl
            || ''
        );

        const label = source || channelLabel || '';

        if (!label) return null;
        return {
            label,
            imageUrl: imageUrl || null,
            moduleName: moduleName || null,
            moduleId: moduleId || null,
            channelType: channelType || null
        };
    };
    const getChannelMarker = (channelType = '') => {
        const clean = String(channelType || '').trim().toLowerCase();
        if (!clean) return { key: 'generic', short: 'CH', label: 'Canal' };
        if (clean === 'whatsapp') return { key: 'whatsapp', short: 'WA', label: 'WhatsApp' };
        if (clean === 'instagram') return { key: 'instagram', short: 'IG', label: 'Instagram' };
        if (clean === 'messenger') return { key: 'messenger', short: 'MS', label: 'Messenger' };
        if (clean === 'facebook') return { key: 'facebook', short: 'FB', label: 'Facebook' };
        if (clean === 'webchat') return { key: 'webchat', short: 'WEB', label: 'Webchat' };
        return { key: 'generic', short: clean.slice(0, 3).toUpperCase(), label: clean.toUpperCase() };
    };
    const resetFilters = () => {
        onFiltersChange?.(normalizeFilters({
            labelTokens: [],
            unreadOnly: false,
            unlabeledOnly: false,
            contactMode: 'all',
            archivedMode: 'all',
            pinnedMode: 'all',
        }));
    };

    const currentTenantId = String(activeTenantId || '').trim();
    const sortedTenantOptions = Array.isArray(tenantOptions)
        ? [...tenantOptions].sort((a, b) => String(a?.name || a?.id || '').localeCompare(String(b?.name || b?.id || '')))
        : [];
    const activeTenantOption = sortedTenantOptions.find((tenant) => String(tenant?.id || '').trim() === currentTenantId) || sortedTenantOptions[0] || null;
    const activeTenantLabel = activeTenantOption?.name || activeTenantOption?.id || currentTenantId || 'default';

    const toggleLabel = (token) => {
        const clean = normalizeFilterToken(token);
        if (!clean) return;
        const next = new Set(filters.labelTokens);
        if (next.has(clean)) next.delete(clean); else next.add(clean);
        updateFilters({ labelTokens: Array.from(next), unlabeledOnly: false });
    };

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
                                    <span className="sidebar-active-filter-empty">Filtro activo: Todos</span>
                                ) : (
                                    activeFilterChips.map((chip, index) => (
                                        <span key={`${chip}_${index}`} className="sidebar-active-filter-chip">
                                            {chip}
                                        </span>
                                    ))
                                )}
                            </div>
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
                {filteredChats.length === 0 && chats.length === 0 ? (
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
                        const subtitle = getSubtitle(chat);
                        const moduleBadge = getChannelBadge(chat);
                        const channelMarker = getChannelMarker(moduleBadge?.channelType || '');
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
                                        <span className="chat-display-name">{displayName}</span>
                                        <span className={`chat-time ${chat.unreadCount > 0 ? 'chat-time-unread' : ''}`}>
                                            {formatTime(chat.timestamp)}
                                        </span>
                                    </div>

                                    {subtitle && <p className="chat-subtitle-modern">{subtitle}</p>}

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


















