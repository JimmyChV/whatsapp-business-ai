import { useEffect } from 'react';

export default function useGlobalEscapeToCloseChat({
  activeChatIdRef,
  handleExitActiveChat
} = {}) {
  useEffect(() => {
    const onGlobalKeyDown = (event) => {
      if (event.key !== 'Escape' || event.repeat) return;
      if (!activeChatIdRef?.current) return;
      event.preventDefault();
      if (typeof handleExitActiveChat === 'function') handleExitActiveChat();
    };

    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, [activeChatIdRef, handleExitActiveChat]);
}
