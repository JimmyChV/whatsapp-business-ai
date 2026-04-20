export default function BusinessQuickRepliesTabSection({
    quickSearch = '',
    setQuickSearch,
    filteredQuickReplies = [],
    onSendQuickReply,
    setInputText,
    canWriteByAssignment = false
}) {
    return (
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ background: '#1f2c34', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px' }}>
                <input
                    type="text"
                    value={quickSearch}
                    disabled={!canWriteByAssignment}
                    onChange={e => setQuickSearch(e.target.value)}
                    placeholder="Buscar respuesta rapida"
                    style={{ width: '100%', background: '#111b21', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '8px', padding: '8px 10px', fontSize: '0.78rem', outline: 'none', opacity: canWriteByAssignment ? 1 : 0.75, cursor: canWriteByAssignment ? 'text' : 'not-allowed' }}
                />
            </div>

            <div style={{ background: '#202c33', borderRadius: '10px', border: '1px solid var(--border-color)', padding: '10px', color: '#8696a0', fontSize: '0.78rem' }}>
                Gestion centralizada: crea y edita respuestas rapidas solo desde Panel SaaS. En chat puedes buscarlas y usarlas.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {filteredQuickReplies.length === 0 ? (
                    <div style={{ background: '#1f2c34', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px', color: '#8696a0', fontSize: '0.78rem' }}>
                        No hay respuestas rapidas para mostrar.
                    </div>
                ) : (
                    filteredQuickReplies.map((qr) => (
                        <div key={qr.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'center' }}>
                            <button
                                className="ai-prompt-chip"
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
                                    background: '#202c33',
                                    border: '1px solid var(--border-color)',
                                    cursor: canWriteByAssignment ? 'pointer' : 'not-allowed',
                                    textAlign: 'left',
                                    color: 'var(--text-primary)',
                                    transition: 'all 0.12s',
                                    opacity: canWriteByAssignment ? 1 : 0.75
                                }}
                                onMouseEnter={e => e.currentTarget.style.borderColor = '#00a884'}
                                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                            >
                                <div style={{ fontSize: '0.84rem', fontWeight: 500, marginBottom: '3px' }}>{qr.label}</div>
                                <div style={{ fontSize: '0.72rem', color: '#8696a0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
