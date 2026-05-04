export default function BusinessQuickRepliesTabSection({
    quickSearch = '',
    setQuickSearch,
    filteredQuickReplies = [],
    onSendQuickReply,
    setInputText,
    canWriteByAssignment = false
}) {
    return (
        <div className="quick-replies-shell" style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="quick-replies-search-card" style={{ background: 'var(--chat-card-surface)', border: '1px solid var(--chat-card-border)', borderRadius: '8px', padding: '8px' }}>
                <input
                    className="quick-replies-search-input"
                    type="text"
                    value={quickSearch}
                    disabled={!canWriteByAssignment}
                    onChange={e => setQuickSearch(e.target.value)}
                    placeholder="Buscar respuesta rapida"
                    style={{ width: '100%', background: 'var(--chat-control-surface-strong)', border: '1px solid var(--chat-card-border)', color: 'var(--text-primary)', borderRadius: '8px', padding: '8px 10px', fontSize: '0.78rem', outline: 'none', opacity: canWriteByAssignment ? 1 : 0.75, cursor: canWriteByAssignment ? 'text' : 'not-allowed' }}
                />
            </div>

            <div className="quick-replies-info" style={{ background: 'var(--chat-info-surface)', borderRadius: '10px', border: '1px solid var(--chat-info-border)', padding: '10px', color: 'var(--chat-control-text-soft)', fontSize: '0.78rem' }}>
                Gestion centralizada: crea y edita respuestas rapidas solo desde Panel SaaS. En chat puedes buscarlas y usarlas.
            </div>

            <div className="quick-replies-list" style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {filteredQuickReplies.length === 0 ? (
                    <div className="quick-replies-empty" style={{ background: 'var(--chat-card-surface)', border: '1px solid var(--chat-card-border)', borderRadius: '8px', padding: '10px', color: 'var(--chat-control-text-soft)', fontSize: '0.78rem' }}>
                        No hay respuestas rapidas para mostrar.
                    </div>
                ) : (
                    filteredQuickReplies.map((qr) => (
                        <div key={qr.id} className="quick-replies-item-row" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'center' }}>
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
                                    padding: '10px 12px',
                                    borderRadius: '8px',
                                    background: 'var(--chat-card-surface)',
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
                                <div className="quick-replies-item-title" style={{ fontSize: '0.84rem', fontWeight: 500, marginBottom: '3px' }}>{qr.label}</div>
                                <div className="quick-replies-item-preview" style={{ fontSize: '0.72rem', color: 'var(--chat-control-text-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {String(qr.text || '').split('\n')[0]}
                                </div>
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
