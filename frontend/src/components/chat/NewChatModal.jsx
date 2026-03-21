function NewChatModal({
  isOpen,
  dialog,
  availableModules,
  onChange,
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
        <p className="new-chat-modal-subtitle">Selecciona el modulo y abre una conversacion sin mezclar chats entre canales.</p>

        <label className="new-chat-modal-label" htmlFor="new-chat-phone">Numero (con codigo de pais)</label>
        <input
          id="new-chat-phone"
          type="text"
          value={dialog.phone}
          onChange={(event) => onChange({ phone: event.target.value, error: '' })}
          onKeyDown={(event) => { if (event.key === 'Enter') onConfirm(); }}
          className="new-chat-modal-input"
          placeholder="Ej: 51955123456"
          autoFocus
        />

        <label className="new-chat-modal-label" htmlFor="new-chat-module">Modulo</label>
        <select
          id="new-chat-module"
          value={dialog.moduleId}
          onChange={(event) => onChange({ moduleId: event.target.value, error: '' })}
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
