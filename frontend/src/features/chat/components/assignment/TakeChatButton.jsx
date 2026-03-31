import React from 'react';

export default function TakeChatButton({
  chatId = '',
  scopeModuleId = '',
  assignment = null,
  chatAssignmentState = null,
  className = ''
}) {
  const safeChatId = String(chatId || '').trim();
  const safeScopeModuleId = String(scopeModuleId || '').trim().toLowerCase();
  const takeChat = typeof chatAssignmentState?.takeChat === 'function'
    ? chatAssignmentState.takeChat
    : null;
  const pendingMap = chatAssignmentState?.takeChatPendingByChatId || {};
  const pending = Boolean(
    pendingMap?.[safeChatId]
    || pendingMap?.[`${safeChatId}::mod::${safeScopeModuleId}`]
  );

  const handleTakeChat = () => {
    if (!takeChat || !safeChatId || pending) return;
    takeChat(safeChatId, {
      scopeModuleId: safeScopeModuleId || undefined,
      assignmentReason: 'manual_take',
      metadata: {
        source: 'chat_take_button',
        previousStatus: String(assignment?.status || '').trim().toLowerCase() || null
      }
    });
  };

  return (
    <button
      type="button"
      className={`take-chat-button${className ? ` ${className}` : ''}`}
      onClick={handleTakeChat}
      disabled={!takeChat || !safeChatId || pending}
      title={pending ? 'Tomando chat...' : 'Tomar chat'}
    >
      {pending ? 'Tomando...' : 'Tomar chat'}
    </button>
  );
}
