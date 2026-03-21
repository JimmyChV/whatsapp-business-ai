import { useEffect } from 'react';

import useSaasPanelActions from './useSaasPanelActions';
import useSaasPanelLoadEffects from './useSaasPanelLoadEffects';

export default function useSaasPanelBootstrap({
  actions,
  loadEffects,
  setRunAction
}) {
  const {
    runAction,
    handleOpenOperation,
    handleFormImageUpload
  } = useSaasPanelActions(actions);

  useEffect(() => {
    setRunAction(runAction);
  }, [runAction, setRunAction]);

  useSaasPanelLoadEffects({
    ...loadEffects,
    runAction
  });

  return {
    runAction,
    handleOpenOperation,
    handleFormImageUpload
  };
}
