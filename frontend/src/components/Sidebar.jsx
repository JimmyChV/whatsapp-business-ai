import React, { useState } from 'react';
import { MoreVertical, Search, Filter, Check, CheckCheck, X } from 'lucide-react';
import moment from 'moment';

const Sidebar = ({ chats, activeChatId, onChatSelect, myProfile }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [showMenu, setShowMenu] = useState(false);

    const formatTime = (ts) => {
        const m = moment.unix(ts);
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

    const filteredChats = chats.filter(c =>
        c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.lastMessage?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const avatarLetter = (name) => name ? name.charAt(0).toUpperCase() : '?';
    const avatarColor = (name) => {
        const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444'];
        if (!name) return colors[0];
        return colors[name.charCodeAt(0) % colors.length];
    };

    return (
        <div className="sidebar">
            {/* Header */}
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
                    <Filter size={20} color="#8696a0" style={{ cursor: 'pointer' }} title="Filtrar" />
                    <div style={{ position: 'relative' }}>
                        <MoreVertical
                            size={20}
                            color="#8696a0"
                            style={{ cursor: 'pointer' }}
                            onClick={() => setShowMenu(v => !v)}
                            title="Más opciones"
                        />
                        {showMenu && (
                            <div style={{
                                position: 'absolute', top: '28px', right: 0, background: '#233138',
                                borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                                minWidth: '200px', zIndex: 1000, overflow: 'hidden'
                            }}>
                                {[
                                    { label: 'Nuevo grupo', action: () => { } },
                                    { label: 'Nueva transmisión', action: () => { } },
                                    { label: 'Chats archivados', action: () => { } },
                                    { label: 'Mensajes destacados', action: () => { } },
                                    { label: 'Configuración', action: () => { } },
                                ].map((item, i) => (
                                    <div key={i}
                                        onClick={() => { item.action(); setShowMenu(false); }}
                                        style={{ padding: '14px 20px', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-primary)', borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                        {item.label}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Search Bar */}
            <div style={{ padding: '7px 12px', background: 'var(--sidebar-background)', borderBottom: '1px solid var(--border-color)' }}>
                <div className="input-container" style={{ borderRadius: '8px', background: '#202c33', display: 'flex', alignItems: 'center', height: '35px' }}>
                    <Search size={16} color="#8696a0" style={{ margin: '0 12px', flexShrink: 0 }} />
                    <input
                        type="text"
                        placeholder="Busca un chat o inicia uno nuevo"
                        className="message-input"
                        style={{ fontSize: '0.85rem', flex: 1 }}
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <X size={16} color="#8696a0" style={{ margin: '0 12px', cursor: 'pointer' }} onClick={() => setSearchQuery('')} />
                    )}
                </div>
            </div>

            {/* Chat List */}
            <div className="chat-list" onClick={() => showMenu && setShowMenu(false)}>
                {filteredChats.length === 0 && chats.length === 0 ? (
                    [1, 2, 3, 4, 5].map(i => (
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
                    filteredChats.map(chat => (
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
                                    <span style={{ fontSize: '1.0rem', fontWeight: 400, color: 'var(--text-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: '220px' }}>
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
                                        {chat.labels?.map((l, idx) => (
                                            <span key={idx} style={{
                                                width: '8px', height: '8px', borderRadius: '50%',
                                                background: l.color || '#8696a0', display: 'inline-block'
                                            }} title={l.name} />
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
