import { useEffect, useRef, useState } from 'react';

const useChatWindowSearchController = ({
  messages = []
} = {}) => {
  const [searchVisible, setSearchVisible] = useState(false);
  const [chatSearch, setChatSearch] = useState('');
  const [activeMatchIdx, setActiveMatchIdx] = useState(0);
  const messageRefs = useRef({});

  const searchTerm = chatSearch.trim().toLowerCase();
  const matchIndexes = searchTerm
    ? messages.reduce((acc, msg, idx) => (String(msg.body || '').toLowerCase().includes(searchTerm) ? [...acc, idx] : acc), [])
    : [];

  const jumpToMatch = (idx) => {
    const targetMessageIdx = matchIndexes[idx];
    if (targetMessageIdx === undefined) return;
    const messageId = messages[targetMessageIdx]?.id || `idx_${targetMessageIdx}`;
    const node = messageRefs.current[messageId];
    if (node?.scrollIntoView) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  useEffect(() => {
    if (!matchIndexes.length) {
      setActiveMatchIdx(0);
      return;
    }
    setActiveMatchIdx(0);
    setTimeout(() => jumpToMatch(0), 0);
  }, [chatSearch, messages.length]);

  return {
    searchVisible,
    setSearchVisible,
    chatSearch,
    setChatSearch,
    activeMatchIdx,
    setActiveMatchIdx,
    messageRefs,
    searchTerm,
    matchIndexes,
    jumpToMatch
  };
};

export default useChatWindowSearchController;
