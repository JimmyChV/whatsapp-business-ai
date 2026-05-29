export default function BusinessQuickRepliesTabSection({
    quickSearch = '',
    setQuickSearch,
    filteredQuickReplies = [],
    onSendQuickReply,
    setInputText,
    canWriteByAssignment = false
}) {
    return (
        <div className="quick-replies-shell" style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div className="quick-replies-search-card" style={{ border: '1px solid var(--chat-card-border)', borderRadius: '12px', padding: '10px' }}>
                <input
                    className="quick-replies-search-input"
                    type="text"
                    value={quickSearch}
                    disabled={!canWriteByAssignment}
                    onChange={e => setQuickSearch(e.target.value)}
                    placeholder="Buscar respuesta rapida"
                    style={{ width: '100%', background: 'var(--chat-control-surface-strong)', border: '1px solid var(--chat-card-border)', color: 'var(--text-primary)', borderRadius: '10px', padding: '10px 12px', fontSize: '0.79rem', outline: 'none', opacity: canWriteByAssignment ? 1 : 0.75, cursor: canWriteByAssignment ? 'text' : 'not-allowed' }}
                />
            </div>

            <div className="quick-replies-info" style={{ borderRadius: '12px', border: '1px solid var(--chat-info-border)', padding: '12px 13px', fontSize: '0.77rem', lineHeight: 1.45 }}>
                Gestion centralizada: crea y edita respuestas rapidas solo desde Panel SaaS. En chat puedes buscarlas y usarlas.
            </div>

            <div className="quick-replies-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {filteredQuickReplies.length === 0 ? (
                    <div className="quick-replies-empty" style={{ border: '1px solid var(--chat-card-border)', borderRadius: '12px', padding: '12px', fontSize: '0.78rem' }}>
                        No hay respuestas rapidas para mostrar.
                    </div>
                ) : (
                    filteredQuickReplies.map((qr) => (
                        <div key={qr.id} className="quick-replies-item-row" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px', alignItems: 'stretch' }}>
                            <button
                                className="ai-prompt-chip quick-replies-item"
                                onClick={() => {
                                    if (typeof onSendQuickReply === 'function') {
                                        onSendQuickReply(qr);
                                    } else {
                                        setInputText(qr.text || '');
                                    }
                                }}
                                disabled={!canWriteByAssignment}
                                style={{
                                    width: '100%',
                                    padding: '12px 13px',
                                    borderRadius: '14px',
                                    border: '1px solid var(--chat-card-border)',
                                    cursor: canWriteByAssignment ? 'pointer' : 'not-allowed',
                                    textAlign: 'left',
                                    color: 'var(--text-primary)',
                                    transition: 'all 0.12s',
                                    opacity: canWriteByAssignment ? 1 : 0.75
                                }}
                                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--saas-accent-primary)'}
                                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--chat-card-border)'}
                            >
                                <div className="quick-replies-item-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '5px' }}>
                                    <div className="quick-replies-item-title" style={{ fontSize: '0.9rem', fontWeight: 700, minWidth: 0 }}>{qr.label}</div>
                                    <span className="quick-replies-item-action" style={{ flexShrink: 0, fontSize: '0.68rem', fontWeight: 800, color: 'var(--chat-success-text)', background: 'var(--chat-success-surface)', border: '1px solid var(--chat-success-border)', borderRadius: '999px', padding: '3px 8px' }}>
                                        Usar
                                    </span>
                                </div>
                                <div className="quick-replies-item-preview" style={{ fontSize: '0.75rem', color: 'var(--chat-control-text-soft)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.45 }}>
                                    {String(qr.text || '').trim() || 'Sin contenido'}
                                </div>
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
