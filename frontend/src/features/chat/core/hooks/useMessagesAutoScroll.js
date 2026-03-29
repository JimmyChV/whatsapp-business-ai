import { useLayoutEffect, useRef } from 'react';

export function useMessagesAutoScroll({
  messages,
  messagesEndRef,
  prevMessagesMetaRef,
  shouldInstantScrollRef,
  suppressSmoothScrollUntilRef
}) {
  const frameRef = useRef(0);

  useLayoutEffect(() => {
    const endNode = messagesEndRef.current;
    if (!endNode) return;
    const messagesContainer = endNode.parentElement;
    if (!messagesContainer) return;

    const nextCount = Array.isArray(messages) ? messages.length : 0;
    const nextLastId = nextCount > 0 ? String(messages[nextCount - 1]?.id || '') : '';
    const prevMeta = prevMessagesMetaRef.current || { count: 0, lastId: '' };
    const isNewMessageAppend = nextCount > prevMeta.count && nextLastId !== prevMeta.lastId;

    const distanceToBottom = messagesContainer.scrollHeight - (messagesContainer.scrollTop + messagesContainer.clientHeight);
    const userNearBottom = distanceToBottom <= 96;
    const shouldForceScroll = shouldInstantScrollRef.current || (isNewMessageAppend && userNearBottom);

    if (shouldForceScroll) {
      const inQuietWindow = Date.now() < suppressSmoothScrollUntilRef.current;
      const behavior = (shouldInstantScrollRef.current || inQuietWindow || !isNewMessageAppend) ? 'auto' : 'smooth';

      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => {
        const targetTop = messagesContainer.scrollHeight;
        if (behavior === 'smooth') {
          messagesContainer.scrollTo({ top: targetTop, behavior: 'smooth' });
        } else {
          messagesContainer.scrollTop = targetTop;
        }
      });
    }

    if (shouldInstantScrollRef.current) shouldInstantScrollRef.current = false;
    prevMessagesMetaRef.current = { count: nextCount, lastId: nextLastId };
    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;
      }
    };
  }, [messages, messagesEndRef, prevMessagesMetaRef, shouldInstantScrollRef, suppressSmoothScrollUntilRef]);
}
