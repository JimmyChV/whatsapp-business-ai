import React, { useMemo, useState } from 'react';
import { MoreVertical, Search, Check, CheckCheck, X } from 'lucide-react';
import moment from 'moment';

const WA_LABEL_COLORS = ['#25D366', '#34B7F1', '#FFB02E', '#FF5C5C', '#9C6BFF', '#00A884', '#7D8D95'];

const normalizePhoneDigits = (value = '') => String(value || '').replace(/\D/g, '');
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
}) => {
    const [showMenu, setShowMenu] = useState(false);
    const [labelFilter, setLabelFilter] = useState('all');

    const localQuery = String(searchQuery || '');
    const searchIsPhone = /^\+?\d{6,15}$/.test(localQuery.trim());
    const normalizedPhone = normalizePhoneDigits(localQuery);

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
        const fromChats = chats.flatMap((c) => c.labels || []);
        const merged = [...(labelDefinitions || []), ...fromChats];
        const map = new Map();
        merged.forEach((l, idx) => {
            if (!l?.name) return;
            if (!map.has(l.name)) {
                map.set(l.name, {
                    name: l.name,
                    color: l.color || WA_LABEL_COLORS[idx % WA_LABEL_COLORS.length],
                });
            }
        });
        return Array.from(map.values());
    }, [chats, labelDefinitions]);

    const filteredChats = chats.filter((c) => {
        const matchesLabel = labelFilter === 'all' || (c.labels || []).some((l) => l.name === labelFilter);

        const q = String(localQuery || '').trim().toLowerCase();
        if (!q) return matchesLabel;

        const qDigits = normalizePhoneDigits(q);
        const name = String(c?.name || '').toLowerCase();
        const subtitle = String(c?.subtitle || '').toLowerCase();
        const lastMessage = String(c?.lastMessage || '').toLowerCase();
        const phone = normalizePhoneDigits(c?.phone || c?.id || '');

        const matchesSearch = qDigits
            ? phone.includes(qDigits)
            : (name.includes(q) || subtitle.includes(q) || lastMessage.includes(q));

        return matchesLabel && matchesSearch;
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
        if (chat?.isMyContact) {
            if (rawName && !isInternalIdentifier(rawName)) return rawName;
            return phone || 'Sin nombre';
        }
        if (phone) return phone;
        if (rawName && !isInternalIdentifier(rawName)) return rawName;
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
        const candidates = [statusText, subtitleText].filter((v) => isHumanSubtitle(v) && !isInternalIdentifier(v));
        const profileLabel = candidates.find((v) => v !== getDisplayName(chat)) || '';

        if (chat?.isMyContact) {
            if (profileLabel && phone && profileLabel !== phone) return `${profileLabel} - ${phone}`;
            return phone;
        }

        if (profileLabel) return profileLabel;
        if (phone && phone !== getDisplayName(chat)) return phone;
        return '';
    };

    return (
        <div className="sidebar sidebar-pro">
            <div className="sidebar-header sidebar-header-pro">
                <div className="sidebar-account-block">
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
                </div>

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
                            <button type="button" className="sidebar-menu-item" onClick={() => { onStartNewChat?.(); setShowMenu(false); }}>
                                Nuevo chat (numero)
                            </button>
                            <button type="button" className="sidebar-menu-item" onClick={() => { onRefreshChats?.(); setShowMenu(false); }}>
                                Recargar chats
                            </button>
                            <button type="button" className="sidebar-menu-item" onClick={() => { onCreateLabel?.(); setShowMenu(false); }}>
                                Crear etiqueta
                            </button>
                            <button type="button" className="sidebar-menu-item sidebar-menu-item-danger" onClick={() => { onLogout?.(); setShowMenu(false); }}>
                                Cerrar sesion WhatsApp
                            </button>
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
                                onStartNewChat?.(normalizedPhone, '');
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
                    <button type="button" className="ui-btn ui-btn--primary ui-btn--block" onClick={() => onStartNewChat?.(normalizedPhone, '')}>
                        Abrir chat con {normalizedPhone}
                    </button>
                )}

                <div className="label-chip-row">
                    <button
                        onClick={() => setLabelFilter('all')}
                        className={`label-chip ${labelFilter === 'all' ? 'active' : ''}`}
                    >Todos</button>
                    {allLabels.map((label) => (
                        <button
                            key={label.name}
                            onClick={() => setLabelFilter(label.name)}
                            className={`label-chip ${labelFilter === label.name ? 'active' : ''}`}
                            style={{ '--label-color': label.color || '#7D8D95' }}
                        >{label.name}</button>
                    ))}
                </div>
            </div>

            <div className="chat-list" onClick={() => showMenu && setShowMenu(false)} onScroll={handleChatListScroll}>
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
                        Sin resultados para "{localQuery}"
                    </div>
                ) : (
                    filteredChats.map((chat) => {
                        const displayName = getDisplayName(chat);
                        const subtitle = getSubtitle(chat);
                        const lastMessage = sanitizeDisplayText(chat.lastMessage || '') || 'Haz clic para chatear';
                        return (
                            <div
                                key={chat.id}
                                className={`chat-item chat-item-modern ${activeChatId === chat.id ? 'active' : ''}`}
                                onClick={() => onChatSelect(chat.id, { clearSearch: true })}
                            >
                                <div
                                    className="chat-avatar-modern"
                                    style={{ background: chat.profilePicUrl ? `url(${chat.profilePicUrl}) center/cover` : avatarColor(displayName) }}
                                >
                                    {!chat.profilePicUrl && avatarLetter(displayName)}
                                </div>

                                <div className="chat-info chat-info-modern">
                                    <div className="chat-row-top">
                                        <span className="chat-display-name">{displayName}</span>
                                        <span className={`chat-time ${chat.unreadCount > 0 ? 'chat-time-unread' : ''}`}>
                                            {formatTime(chat.timestamp)}
                                        </span>
                                    </div>

                                    {subtitle && <p className="chat-subtitle-modern">{subtitle}</p>}

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
    );
};

export default Sidebar;
