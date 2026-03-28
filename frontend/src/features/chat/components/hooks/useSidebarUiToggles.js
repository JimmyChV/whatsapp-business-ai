import { useState } from 'react';

const useSidebarUiToggles = () => {
  const [showMenu, setShowMenu] = useState(false);
  const [showLabelPanel, setShowLabelPanel] = useState(false);

  return {
    showMenu,
    setShowMenu,
    showLabelPanel,
    setShowLabelPanel
  };
};

export default useSidebarUiToggles;
