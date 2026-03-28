import { useEffect, useState } from 'react';

const useChatWindowUiToggles = () => {
  const [showMenu, setShowMenu] = useState(false);
  const [showLabelMenu, setShowLabelMenu] = useState(false);
  const [lightboxMedia, setLightboxMedia] = useState(null);
  const [showMapModal, setShowMapModal] = useState(false);

  useEffect(() => {
    const onEsc = (event) => {
      if (event.key === 'Escape') {
        setLightboxMedia(null);
        setShowMapModal(false);
      }
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, []);

  return {
    showMenu,
    setShowMenu,
    showLabelMenu,
    setShowLabelMenu,
    lightboxMedia,
    setLightboxMedia,
    showMapModal,
    setShowMapModal
  };
};

export default useChatWindowUiToggles;
