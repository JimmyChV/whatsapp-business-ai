import React, { useMemo, useState } from 'react';
import { MoreVertical, Search, Check, CheckCheck, X, Plus } from 'lucide-react';
import moment from 'moment';

const WA_LABEL_COLORS = ['#25D366', '#34B7F1', '#FFB02E', '#FF5C5C', '#9C6BFF', '#00A884', '#7D8D95'];

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
    onToggleChatLabel,
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [showMenu, setShowMenu] = useState(false);
    const [labelFilter, setLabelFilter] = useState('all');

    const searchIsPhone = /^\+?\d{8,15}$/.test(searchQuery.trim());
    const normalizedPhone = searchQuery.replace(/\D/g, '');

    const formatTime = (ts) => {
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
            <span style={{ marginRight: '4px', display: 'inline-flex', verticalAlign: 'middle', flexShrink: 0 }}>
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
        const q = searchQuery.toLowerCase();
        const matchesSearch = searchIsPhone
            ? true
            : (c.name?.toLowerCase().includes(q) || c.lastMessage?.toLowerCase().includes(q));
        const matchesLabel = labelFilter === 'all' || (c.labels || []).some((l) => l.name === labelFilter);
        return matchesSearch && matchesLabel;
    });

    const avatarLetter = (name) => (name ? name.charAt(0).toUpperCase() : '?');
    const avatarColor = (name) => {
        const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444'];
        if (!name) return colors[0];
        return colors[name.charCodeAt(0) % colors.length];
    };

    const activeChat = chats.find((c) => c.id === activeChatId);

    return (
        <div className="sidebar">
            <div className="sidebar-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: '40px', height: '40px', borderRadius: '50%',
                        background: myProfile?.profilePicUrl ? `url(${myProfile.profilePicUrl}) center/cover` : '#3b4a54',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1rem', color: '#8696a0', flexShrink: 0, overflow: 'hidden'
                    }}>
                        {!myProfile?.profilePicUrl && (myProfile?.pushname?.charAt(0)?.toUpperCase() || '?')}
                    </div>
                    {myProfile?.pushname && (
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {myProfile.pushname}
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '20px', alignItems: 'center', position: 'relative' }}>
                    <div style={{ position: 'relative' }}>
                        <MoreVertical
                            size={20}
                            color="#8696a0"
                            style={{ cursor: 'pointer' }}
                            onClick={() => setShowMenu((v) => !v)}
                            title="Más opciones"
                        />
                        {showMenu && (
                            <div style={{
                                position: 'absolute', top: '28px', right: 0, background: '#233138',
                                borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                                minWidth: '220px', zIndex: 1000, overflow: 'hidden'
                            }}>
                                {[
                                    { label: 'Nuevo chat (número)', action: () => onStartNewChat?.() },
                                    { label: 'Recargar chats', action: () => onRefreshChats?.() },
                                    { label: 'Crear etiqueta', action: () => onCreateLabel?.() },
                                    { label: 'Cerrar sesión WhatsApp', action: () => onLogout?.() },
                                ].map((item, i) => (
                                    <div key={i}
                                        onClick={() => { item.action(); setShowMenu(false); }}
                                        style={{ padding: '14px 20px', cursor: 'pointer', fontSize: '0.9rem', color: i === 3 ? '#ff6b6b' : 'var(--text-primary)', borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                    >
                                        {item.label}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div style={{ padding: '7px 12px', background: 'var(--sidebar-background)', borderBottom: '1px solid var(--border-color)' }}>
                <div className="input-container" style={{ borderRadius: '8px', background: '#202c33', display: 'flex', alignItems: 'center', height: '35px' }}>
                    <Search size={16} color="#8696a0" style={{ margin: '0 12px', flexShrink: 0 }} />
                    <input
                        type="text"
                        placeholder="Busca chat o escribe número"
                        className="message-input"
                        style={{ fontSize: '0.85rem', flex: 1 }}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && searchIsPhone) {
                                onStartNewChat?.(normalizedPhone, '');
                            }
                        }}
                    />
                    {searchQuery && (
                        <X size={16} color="#8696a0" style={{ margin: '0 12px', cursor: 'pointer' }} onClick={() => setSearchQuery('')} />
                    )}
                </div>

                {searchIsPhone && (
                    <button
                        onClick={() => onStartNewChat?.(normalizedPhone, '')}
                        style={{
                            marginTop: '8px', width: '100%', background: '#00a884', color: '#06271f', border: 'none',
                            borderRadius: '8px', padding: '8px 10px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem'
                        }}
                    >
                        Abrir chat con +{normalizedPhone}
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

                {activeChat && allLabels.length > 0 && (
                    <div style={{ marginTop: '6px', display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.68rem', color: '#9db0ba' }}>Etiquetar chat:</span>
                        {allLabels.map((label) => {
                            const active = (activeChat.labels || []).some((l) => l.name === label.name);
                            return (
                                <button
                                    key={`assign_${label.name}`}
                                    onClick={() => onToggleChatLabel?.(activeChat.id, label.name)}
                                    className={`label-chip ${active ? 'active' : ''}`}
                                    style={{ '--label-color': label.color || '#7D8D95', padding: '2px 8px', fontSize: '0.66rem' }}
                                >
                                    {active ? '✓ ' : <Plus size={10} style={{ verticalAlign: 'middle' }} />} {label.name}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="chat-list" onClick={() => showMenu && setShowMenu(false)}>
                {filteredChats.length === 0 && chats.length === 0 ? (
                    [1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="chat-item">
                            <div className="chat-avatar skeleton" style={{ width: '49px', height: '49px', borderRadius: '50%', flexShrink: 0 }}></div>
                            <div className="chat-info" style={{ marginLeft: '15px', flex: 1 }}>
                                <div className="skeleton" style={{ height: '14px', width: '60%', marginBottom: '10px' }}></div>
                                <div className="skeleton" style={{ height: '10px', width: '40%' }}></div>
                            </div>
                        </div>
                    ))
                ) : filteredChats.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        Sin resultados para "{searchQuery}"
                    </div>
                ) : (
                    filteredChats.map((chat) => (
                        <div
                            key={chat.id}
                            className={`chat-item ${activeChatId === chat.id ? 'active' : ''}`}
                            onClick={() => onChatSelect(chat.id)}
                        >
                            <div style={{
                                width: '49px', height: '49px', borderRadius: '50%',
                                background: chat.profilePicUrl ? `url(${chat.profilePicUrl}) center/cover` : avatarColor(chat.name),
                                flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '1.2rem', color: 'white', fontWeight: 500, overflow: 'hidden'
                            }}>
                                {!chat.profilePicUrl && avatarLetter(chat.name)}
                            </div>
                            <div className="chat-info" style={{ marginLeft: '15px', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--text-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: '220px' }}>
                                        {chat.name}
                                    </span>
                                    <span style={{ fontSize: '0.73rem', color: chat.unreadCount > 0 ? '#00a884' : '#8696a0', flexShrink: 0, marginLeft: '8px' }}>
                                        {formatTime(chat.timestamp)}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px', alignItems: 'center' }}>
                                    <p style={{ fontSize: '0.875rem', color: '#8696a0', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', display: 'flex', alignItems: 'center', flex: 1 }}>
                                        {renderStatus(chat)}
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {chat.lastMessage || 'Haz clic para chatear'}
                                        </span>
                                    </p>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px', flexShrink: 0 }}>
                                        {chat.labels?.slice(0, 4).map((l, idx) => (
                                            <span key={idx} style={{ width: '8px', height: '8px', borderRadius: '50%', background: l.color || '#8696a0', display: 'inline-block' }} title={l.name} />
                                        ))}
                                        {chat.unreadCount > 0 && (
                                            <span className="unread-badge">{chat.unreadCount}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default Sidebar;
