function NewChatModal({
  isOpen,
  dialog,
  availableModules,
  onChange,
  onSelectCustomerOption,
  onConfirm,
  onCancel
}) {
  if (!isOpen) return null;

  return (
    <div className="new-chat-modal-overlay" onClick={onCancel}>
      <div className="new-chat-modal-card" role="dialog" aria-modal="true" aria-label="Nuevo chat" onClick={(event) => event.stopPropagation()}>
        <div className="new-chat-modal-header">
          <h3>Nuevo chat</h3>
          <button type="button" className="new-chat-modal-close" onClick={onCancel} aria-label="Cerrar">x</button>
        </div>
        <p className="new-chat-modal-subtitle">Busca por nombre o numero, elige el modulo correcto y abre una conversacion sin mezclar chats entre canales.</p>

        <label className="new-chat-modal-label" htmlFor="new-chat-query">Buscar cliente o numero</label>
        <input
          id="new-chat-query"
          type="text"
          value={dialog.query || ''}
          onChange={(event) => onChange({ query: event.target.value, phone: event.target.value, error: '' })}
          onKeyDown={(event) => { if (event.key === 'Enter') onConfirm(); }}
          className="new-chat-modal-input"
          placeholder="Ej: 51955123456 o Maria Perez"
          autoFocus
        />

        {dialog.loading && <div className="new-chat-modal-hint">Buscando clientes...</div>}
        {!dialog.loading && Array.isArray(dialog.customerOptions) && dialog.customerOptions.length > 0 && (
          <div className="new-chat-modal-suggestions" role="listbox" aria-label="Clientes encontrados">
            {dialog.customerOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                className={`new-chat-modal-suggestion ${dialog.selectedCustomerOptionKey === option.key ? 'is-active' : ''}`.trim()}
                onClick={() => onSelectCustomerOption?.(option)}
              >
                <strong>{option.label}</strong>
                {option.sublabel ? <small>{option.sublabel}</small> : null}
              </button>
            ))}
          </div>
        )}

        <label className="new-chat-modal-label" htmlFor="new-chat-phone">Numero seleccionado</label>
        <input
          id="new-chat-phone"
          type="text"
          value={dialog.phone}
          onChange={(event) => onChange({ phone: event.target.value, selectedCustomerOptionKey: '', error: '' })}
          onKeyDown={(event) => { if (event.key === 'Enter') onConfirm(); }}
          className="new-chat-modal-input"
          placeholder="Ej: 51955123456"
        />

        <label className="new-chat-modal-label" htmlFor="new-chat-module">Modulo</label>
        <select
          id="new-chat-module"
          value={dialog.moduleId}
          onChange={(event) => onChange({ moduleId: event.target.value, selectedCustomerOptionKey: '', error: '' })}
          className="new-chat-modal-select"
          disabled={availableModules.length === 0}
        >
          {availableModules.length === 0 && <option value="">Sin modulos activos</option>}
          {availableModules.map((module) => (
            <option key={`new_chat_module_${module.moduleId}`} value={module.moduleId}>
              {module.name}
            </option>
          ))}
        </select>

        <label className="new-chat-modal-label" htmlFor="new-chat-first-message">Mensaje inicial (opcional)</label>
        <textarea
          id="new-chat-first-message"
          value={dialog.firstMessage}
          onChange={(event) => onChange({ firstMessage: event.target.value, error: '' })}
          className="new-chat-modal-textarea"
          rows={3}
          placeholder="Escribe un mensaje de apertura"
        />

        {dialog.error && <div className="new-chat-modal-error">{dialog.error}</div>}

        <div className="new-chat-modal-actions">
          <button type="button" className="new-chat-modal-btn new-chat-modal-btn--ghost" onClick={onCancel}>Cancelar</button>
          <button type="button" className="new-chat-modal-btn new-chat-modal-btn--primary" onClick={onConfirm}>Iniciar chat</button>
        </div>
      </div>
    </div>
  );
}

export default NewChatModal;
